//! Reading files to import (a folder such as an Obsidian vault, or a zip such
//! as a Notion export) and writing export archives. Markdown/HTML parsing
//! happens in the UI, which knows the editor schema; this side only moves bytes.

use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::Path;

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};

use crate::error::{Error, Result};

const MAX_FILES: usize = 20_000;
const MAX_TOTAL: u64 = 1024 * 1024 * 1024;
pub const MAX_IMAGE: usize = 10 * 1024 * 1024;

/// One file found in an import source.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFile {
    /// Path inside the source, with `/` separators.
    pub path: String,
    /// "text", "image" or "pdf".
    pub kind: &'static str,
    pub text: Option<String>,
    pub data_url: Option<String>,
    /// Set by the caller once a PDF has been stored as an attachment.
    pub attachment_id: Option<String>,
    /// Workbooks (xlsx, xls, ods): every sheet as rows of cell text.
    pub sheets: Option<Vec<Sheet>>,
    pub size: u64,
}

#[derive(Debug, Serialize)]
pub struct Sheet {
    pub name: String,
    pub rows: Vec<Vec<String>>,
}

/// Rows past this are left out; a page holding more would not stay usable.
const MAX_SHEET_ROWS: usize = 20_000;

fn is_workbook(ext: &str) -> bool {
    matches!(ext, "xlsx" | "xlsm" | "xlsb" | "xls" | "ods")
}

/// Reads every sheet of a workbook. Dates come out as ISO dates; empty
/// trailing rows and columns are dropped.
pub fn read_workbook(bytes: &[u8]) -> Result<Vec<Sheet>> {
    use calamine::{Data, DataType, Reader};
    let mut book = calamine::open_workbook_auto_from_rs(Cursor::new(bytes)).map_err(|_| Error::Invalid("workbook"))?;
    let mut out = Vec::new();
    for name in book.sheet_names() {
        let Ok(range) = book.worksheet_range(&name) else { continue };
        let mut rows: Vec<Vec<String>> = range
            .rows()
            .take(MAX_SHEET_ROWS)
            .map(|row| {
                let mut cells: Vec<String> = row
                    .iter()
                    .map(|c| match c {
                        Data::Empty => String::new(),
                        Data::DateTime(_) | Data::DateTimeIso(_) => match c.as_datetime() {
                            Some(d) => {
                                use chrono::{Datelike, Timelike};
                                let day = format!("{:04}-{:02}-{:02}", d.year(), d.month(), d.day());
                                if d.time() == chrono::NaiveTime::MIN { day } else { format!("{day} {:02}:{:02}", d.hour(), d.minute()) }
                            }
                            None => c.to_string(),
                        },
                        Data::Error(_) => String::new(),
                        other => other.to_string(),
                    })
                    .collect();
                while cells.last().is_some_and(|c| c.is_empty()) {
                    cells.pop();
                }
                cells
            })
            .collect();
        while rows.last().is_some_and(|r| r.is_empty()) {
            rows.pop();
        }
        if !rows.is_empty() {
            out.push(Sheet { name, rows });
        }
    }
    Ok(out)
}

/// A raw file before classification; PDFs keep their bytes until stored.
pub struct RawFile {
    pub path: String,
    pub bytes: Vec<u8>,
}

pub fn mime_for(ext: &str) -> Option<&'static str> {
    Some(match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "svg" => "image/svg+xml",
        "avif" => "image/avif",
        _ => return None,
    })
}

fn ext_of(path: &str) -> String {
    Path::new(path).extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase()
}

fn wanted(path: &str) -> bool {
    let ext = ext_of(path);
    matches!(ext.as_str(), "md" | "markdown" | "txt" | "html" | "htm" | "json" | "csv" | "tsv" | "pdf" | "zip")
        || is_workbook(&ext)
        || mime_for(&ext).is_some()
}

/// Skips app folders (.obsidian, .git, .trash, __MACOSX…).
fn hidden(path: &str) -> bool {
    path.split('/').any(|part| part.starts_with('.') || part == "__MACOSX" || part == "node_modules")
}

pub fn data_url(bytes: &[u8], mime: &str) -> String {
    format!("data:{mime};base64,{}", B64.encode(bytes))
}

/// Recursively reads a folder (e.g. an Obsidian vault).
pub fn read_folder(root: &Path) -> Result<Vec<RawFile>> {
    let mut out = Vec::new();
    let mut total = 0u64;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        for entry in fs::read_dir(&dir)?.flatten() {
            let path = entry.path();
            let rel = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
            if hidden(&rel) {
                continue;
            }
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                stack.push(path);
            } else if meta.is_file() && wanted(&rel) {
                total += meta.len();
                if out.len() >= MAX_FILES || total > MAX_TOTAL {
                    return Err(Error::Invalid("import is too large"));
                }
                if ext_of(&rel) == "zip" {
                    let mut budget = MAX_TOTAL.saturating_sub(total);
                    out.extend(read_zip_bytes(&fs::read(&path)?, &rel, 1, &mut budget)?);
                    total = MAX_TOTAL - budget;
                } else {
                    out.push(RawFile { path: rel, bytes: fs::read(&path)? });
                }
            }
        }
    }
    Ok(out)
}

pub fn read_zip(path: &Path) -> Result<Vec<RawFile>> {
    let mut budget = MAX_TOTAL;
    read_zip_bytes(&fs::read(path)?, "", 2, &mut budget)
}

/// Notion exports nest zips inside zips; follow them `depth` levels down.
/// `budget` is what may still be unpacked, shared across the nesting. It counts
/// the bytes actually read, because an entry's declared size cannot be trusted.
fn read_zip_bytes(bytes: &[u8], prefix: &str, depth: u8, budget: &mut u64) -> Result<Vec<RawFile>> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| Error::Invalid("not a zip file"))?;
    let mut out = Vec::new();
    for i in 0..archive.len() {
        let file = archive.by_index(i).map_err(|_| Error::Corrupted)?;
        if file.is_dir() {
            continue;
        }
        // `enclosed_name` rejects absolute paths and `..` (zip-slip).
        let Some(name) = file.enclosed_name() else { continue };
        let name = name.to_string_lossy().replace('\\', "/");
        if hidden(&name) || !wanted(&name) {
            continue;
        }
        if out.len() >= MAX_FILES {
            return Err(Error::Invalid("import is too large"));
        }
        let mut data = Vec::new();
        let read = file.take(*budget + 1).read_to_end(&mut data)? as u64;
        if read > *budget {
            return Err(Error::Invalid("import is too large"));
        }
        *budget -= read;
        let path = if prefix.is_empty() { name } else { format!("{prefix}/{name}") };
        if ext_of(&path) == "zip" {
            if depth > 0 {
                let inner = path.trim_end_matches(".zip").to_string();
                out.extend(read_zip_bytes(&data, &inner, depth - 1, budget)?);
            }
        } else {
            out.push(RawFile { path, bytes: data });
        }
    }
    Ok(out)
}

/// Turns raw files into what the UI needs. PDFs are handed to `store_pdf`
/// (which encrypts them as attachments) and come back as ids.
pub fn classify(raw: Vec<RawFile>, mut store_pdf: impl FnMut(&[u8]) -> Result<String>) -> Result<Vec<ImportFile>> {
    let mut out = Vec::with_capacity(raw.len());
    for f in raw {
        let ext = ext_of(&f.path);
        let size = f.bytes.len() as u64;
        let file = match ext.as_str() {
            "md" | "markdown" | "txt" | "html" | "htm" | "json" | "csv" | "tsv" => ImportFile {
                path: f.path,
                kind: "text",
                // Excel and Notion write CSVs with a UTF-8 byte-order mark.
                text: Some(String::from_utf8_lossy(f.bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(&f.bytes)).into_owned()),
                data_url: None,
                attachment_id: None,
                sheets: None,
                size,
            },
            e if is_workbook(e) => match read_workbook(&f.bytes) {
                Ok(sheets) => ImportFile { path: f.path, kind: "sheet", text: None, data_url: None, attachment_id: None, sheets: Some(sheets), size },
                Err(_) => continue,
            },
            // One PDF that cannot be stored (too large) must not sink the import.
            "pdf" => match store_pdf(&f.bytes) {
                Ok(id) => ImportFile {
                    attachment_id: Some(id),
                    path: f.path,
                    kind: "pdf",
                    text: None,
                    data_url: None,
                    sheets: None,
                    size,
                },
                Err(_) => continue,
            },
            _ => match mime_for(&ext) {
                Some(mime) if f.bytes.len() <= MAX_IMAGE => ImportFile {
                    data_url: Some(data_url(&f.bytes, mime)),
                    path: f.path,
                    kind: "image",
                    text: None,
                    attachment_id: None,
                    sheets: None,
                    size,
                },
                _ => continue,
            },
        };
        out.push(file);
    }
    Ok(out)
}

/// One entry of an export archive. Exactly one source is used.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportEntry {
    pub path: String,
    pub text: Option<String>,
    pub base64: Option<String>,
    pub attachment_id: Option<String>,
}

/// Writes entries to a zip. `attachment` resolves attachment ids to bytes.
/// Returns how many attachments could not be read and were left out, so a
/// backup never looks complete when it is not.
pub fn write_zip(
    target: &Path,
    entries: &[ExportEntry],
    mut attachment: impl FnMut(&str) -> Result<Vec<u8>>,
) -> Result<usize> {
    let mut buffer = Cursor::new(Vec::new());
    let mut missing = 0;
    {
        let mut zip = zip::ZipWriter::new(&mut buffer);
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o644);
        for e in entries {
            let path = e.path.trim_start_matches('/').replace('\\', "/");
            if path.is_empty() || path.split('/').any(|p| p == "..") {
                continue;
            }
            let bytes = if let Some(text) = &e.text {
                text.clone().into_bytes()
            } else if let Some(b64) = &e.base64 {
                B64.decode(b64).map_err(|_| Error::Invalid("export data"))?
            } else if let Some(id) = &e.attachment_id {
                match attachment(id) {
                    Ok(b) => b,
                    Err(_) => {
                        missing += 1;
                        continue;
                    }
                }
            } else {
                continue;
            };
            zip.start_file(path, options).map_err(|_| Error::Invalid("export path"))?;
            zip.write_all(&bytes)?;
        }
        zip.finish().map_err(|_| Error::Invalid("export"))?;
    }
    crate::vault::write_atomic(target, buffer.get_ref())?;
    Ok(missing)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zip_roundtrip_and_classification() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("out.zip");
        let entries = vec![
            ExportEntry { path: "Notes/a.md".into(), text: Some("# A".into()), base64: None, attachment_id: None },
            ExportEntry { path: "../evil.md".into(), text: Some("x".into()), base64: None, attachment_id: None },
            ExportEntry { path: "img.png".into(), text: None, base64: Some(B64.encode([137u8, 80, 78, 71])), attachment_id: None },
            ExportEntry { path: "doc.pdf".into(), text: None, base64: None, attachment_id: Some("id1".into()) },
        ];
        assert_eq!(write_zip(&target, &entries, |_| Ok(b"%PDF".to_vec())).unwrap(), 0);

        let raw = read_zip(&target).unwrap();
        let names: Vec<_> = raw.iter().map(|r| r.path.clone()).collect();
        assert!(names.contains(&"Notes/a.md".to_string()));
        assert!(!names.iter().any(|n| n.contains("evil")));

        let files = classify(raw, |b| {
            assert_eq!(b, b"%PDF");
            Ok("att".into())
        })
        .unwrap();
        assert!(files.iter().any(|f| f.kind == "text" && f.text.as_deref() == Some("# A")));
        assert!(files.iter().any(|f| f.kind == "image" && f.data_url.as_deref().unwrap().starts_with("data:image/png")));
        assert!(files.iter().any(|f| f.kind == "pdf" && f.attachment_id.as_deref() == Some("att")));
    }

    #[test]
    fn an_unreadable_attachment_is_counted_not_hidden() {
        let dir = tempfile::tempdir().unwrap();
        let entries = vec![ExportEntry { path: "doc.pdf".into(), text: None, base64: None, attachment_id: Some("gone".into()) }];
        assert_eq!(write_zip(&dir.path().join("o.zip"), &entries, |_| Err(Error::NotFound)).unwrap(), 1);
    }

    #[test]
    fn a_zip_cannot_unpack_past_the_budget() {
        let dir = tempfile::tempdir().unwrap();
        let target = dir.path().join("big.zip");
        let entries = vec![ExportEntry { path: "a.md".into(), text: Some("x".repeat(4096)), base64: None, attachment_id: None }];
        write_zip(&target, &entries, |_| Ok(Vec::new())).unwrap();
        let bytes = fs::read(&target).unwrap();
        let mut small = 100;
        assert!(matches!(read_zip_bytes(&bytes, "", 0, &mut small), Err(Error::Invalid(_))));
        let mut enough = 8192;
        assert_eq!(read_zip_bytes(&bytes, "", 0, &mut enough).unwrap().len(), 1);
        assert_eq!(enough, 4096);
    }

    #[test]
    fn folder_skips_hidden_dirs() {
        let dir = tempfile::tempdir().unwrap();
        fs::create_dir_all(dir.path().join(".obsidian")).unwrap();
        fs::write(dir.path().join(".obsidian/app.json"), "{}").unwrap();
        fs::create_dir_all(dir.path().join("Daily")).unwrap();
        fs::write(dir.path().join("Daily/2026-10-15.md"), "hello").unwrap();
        fs::write(dir.path().join("notes.exe"), "x").unwrap();
        let raw = read_folder(dir.path()).unwrap();
        assert_eq!(raw.len(), 1);
        assert_eq!(raw[0].path, "Daily/2026-10-15.md");
    }
}
