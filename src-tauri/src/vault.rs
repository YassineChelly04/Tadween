//! One account's encrypted vault on disk, and the unlocked session in memory.
//!
//! Layout inside the account directory (see `accounts.rs` for where that is):
//!
//! ```text
//! vault.json             header: KDF parameters, salts, the data key wrapped twice
//!                        (once by the password, once by the recovery key)
//! index.tdw              encrypted: username, folders and vault settings
//! notes/<uuid>.tdw       encrypted: one file per note (title, content, metadata)
//! attachments/<uuid>.tdw encrypted: files embedded in notes (PDFs)
//! ```
//!
//! A random 256-bit data key encrypts everything. Changing the password only
//! re-wraps that key, so notes never need to be re-encrypted.

use std::cmp::Reverse;
use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use zeroize::Zeroizing;

use crate::crypto::{self, KdfParams, Key, SALT_LEN};
use crate::error::{Error, Result};
use crate::text;

pub const HEADER_FILE: &str = "vault.json";
pub const INDEX_FILE: &str = "index.tdw";
pub const NOTES_DIR: &str = "notes";
pub const ATTACHMENTS_DIR: &str = "attachments";
const EXT: &str = "tdw";

const MAX_TITLE: usize = 500;
const MAX_FOLDER_NAME: usize = 120;
const MAX_CONTENT_BYTES: usize = 64 * 1024 * 1024;
pub const MAX_ATTACHMENT_BYTES: usize = 100 * 1024 * 1024;

pub fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

// ── On-disk types ────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Header {
    version: u32,
    kdf: KdfParams,
    password_salt: String,
    password_wrap: String,
    recovery_salt: String,
    recovery_wrap: String,
    created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    pub id: String,
    pub name: String,
    pub created_at: i64,
    /// Pinned folders are the only ones listed in the sidebar.
    #[serde(default)]
    pub pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultSettings {
    /// Minutes of inactivity before the vault locks itself. 0 disables it.
    #[serde(default = "default_auto_lock")]
    pub auto_lock_minutes: u32,
    /// First-run tours already shown ("home", "settings", "page").
    #[serde(default)]
    pub tours_seen: Vec<String>,
    /// The language dictation listens for ("ar", "fr", "en"); unset until chosen.
    #[serde(default)]
    pub dictation_language: Option<String>,
}

/// A partial settings update: missing fields are left as they are.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub auto_lock_minutes: Option<u32>,
    pub tours_seen: Option<Vec<String>>,
    pub dictation_language: Option<String>,
}

fn default_auto_lock() -> u32 {
    10
}

impl Default for VaultSettings {
    fn default() -> Self {
        Self { auto_lock_minutes: default_auto_lock(), tours_seen: Vec::new(), dictation_language: None }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Index {
    /// The account name as the user typed it (kept encrypted).
    #[serde(default)]
    username: String,
    /// What the app calls the user ("Good morning, …"); may differ from the username.
    #[serde(default)]
    display_name: String,
    #[serde(default)]
    folders: Vec<Folder>,
    #[serde(default)]
    settings: VaultSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    /// TipTap/ProseMirror document JSON.
    pub content: Value,
    /// Plain text of the document, used for search and previews.
    #[serde(default)]
    pub text: String,
    pub folder_id: Option<String>,
    /// The page this one lives inside (a sub-page), if any.
    #[serde(default)]
    pub parent_id: Option<String>,
    #[serde(default)]
    pub pinned: bool,
    /// The note's date property, `YYYY-MM-DD`.
    #[serde(default)]
    pub date: Option<String>,
    /// Marks the note as a daily journal entry (shown on the calendar).
    #[serde(default)]
    pub journal: bool,
    /// The page's icon from the app's own set, `name:colour` (e.g. `leaf:ember`).
    #[serde(default)]
    pub icon: Option<String>,
    pub trashed_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub title: String,
    pub preview: String,
    pub folder_id: Option<String>,
    pub parent_id: Option<String>,
    pub pinned: bool,
    pub date: Option<String>,
    pub journal: bool,
    pub icon: Option<String>,
    pub trashed_at: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub words: usize,
}

impl From<&Note> for NoteSummary {
    fn from(n: &Note) -> Self {
        Self {
            id: n.id.clone(),
            title: n.title.clone(),
            preview: text::preview(&n.text, 160),
            folder_id: n.folder_id.clone(),
            parent_id: n.parent_id.clone(),
            pinned: n.pinned,
            date: n.date.clone(),
            journal: n.journal,
            icon: n.icon.clone(),
            trashed_at: n.trashed_at,
            created_at: n.created_at,
            updated_at: n.updated_at,
            words: text::word_count(&n.text),
        }
    }
}

/// A partial update. For nullable fields, a missing key leaves the value
/// alone while an explicit `null` clears it.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NotePatch {
    pub title: Option<String>,
    pub content: Option<Value>,
    pub text: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub folder_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub parent_id: Option<Option<String>>,
    pub pinned: Option<bool>,
    #[serde(default, deserialize_with = "double_option")]
    pub date: Option<Option<String>>,
    pub journal: Option<bool>,
    #[serde(default, deserialize_with = "double_option")]
    pub icon: Option<Option<String>>,
}

fn double_option<'de, T, D>(d: D) -> std::result::Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: Deserializer<'de>,
{
    Deserialize::deserialize(d).map(Some)
}

/// What a new page starts with.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewNote {
    pub folder_id: Option<String>,
    pub date: Option<String>,
    #[serde(default)]
    pub journal: bool,
    pub title: Option<String>,
    /// Makes the new page a sub-page of this one.
    pub parent_id: Option<String>,
}

/// A note coming from an import (Obsidian, Notion, Markdown, Tadween backup).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportNote {
    /// A backup keeps its ids, so sub-pages and the links to them survive.
    /// An id that is malformed or already used is replaced.
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub parent_id: Option<String>,
    pub title: String,
    pub content: Value,
    #[serde(default)]
    pub text: String,
    /// Folder name; created when it does not exist yet.
    pub folder: Option<String>,
    pub date: Option<String>,
    #[serde(default)]
    pub journal: bool,
    #[serde(default)]
    pub pinned: bool,
    #[serde(default)]
    pub icon: Option<String>,
    pub created_at: Option<i64>,
    pub updated_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: String,
    pub title: String,
    pub snippet: String,
    pub folder_id: Option<String>,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnlockReport {
    /// Notes whose files could not be decrypted (damaged or tampered with).
    pub unreadable_notes: usize,
    pub username: String,
    pub display_name: String,
}

/// `name:colour`, both short lower-case words.
fn valid_icon(icon: &str) -> bool {
    let ok = |p: &str| !p.is_empty() && p.len() <= 24 && p.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-');
    matches!(icon.split_once(':'), Some((name, colour)) if ok(name) && ok(colour))
}

fn valid_date(date: &str) -> bool {
    let b = date.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

// ── Vault (files) ────────────────────────────────────────────────────────────

pub struct Vault {
    dir: PathBuf,
    kdf: KdfParams,
}

impl Vault {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir, kdf: KdfParams::default() }
    }

    #[cfg(test)]
    pub fn with_kdf(dir: PathBuf, kdf: KdfParams) -> Self {
        Self { dir, kdf }
    }

    #[cfg(test)]
    pub fn dir(&self) -> &Path {
        &self.dir
    }

    pub fn exists(&self) -> bool {
        self.dir.join(HEADER_FILE).is_file()
    }

    fn notes_dir(&self) -> PathBuf {
        self.dir.join(NOTES_DIR)
    }

    fn note_path(&self, id: &str) -> PathBuf {
        self.notes_dir().join(format!("{id}.{EXT}"))
    }

    fn attachment_path(&self, id: &str) -> PathBuf {
        self.dir.join(ATTACHMENTS_DIR).join(format!("{id}.{EXT}"))
    }

    fn read_header(&self) -> Result<Header> {
        let bytes = fs::read(self.dir.join(HEADER_FILE)).map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => Error::NoVault,
            _ => Error::Io(e),
        })?;
        serde_json::from_slice(&bytes).map_err(|_| Error::Corrupted)
    }

    fn write_header(&self, header: &Header) -> Result<()> {
        write_atomic(&self.dir.join(HEADER_FILE), &serde_json::to_vec_pretty(header)?)
    }

    /// Creates a new vault. Returns the open session and the recovery key,
    /// which is shown to the user once and never stored.
    pub fn create(&self, username: &str, password: &str) -> Result<(Session, Zeroizing<String>)> {
        if self.exists() {
            return Err(Error::VaultExists);
        }
        if !text::password_is_strong(password) {
            return Err(Error::WeakPassword);
        }
        fs::create_dir_all(self.notes_dir())?;

        let data_key = crypto::random_key();
        let recovery_key = crypto::generate_recovery_key();
        let recovery_plain = crypto::normalize_recovery_key(&recovery_key).ok_or(Error::Crypto)?;

        let password_salt = crypto::random_bytes::<SALT_LEN>();
        let recovery_salt = crypto::random_bytes::<SALT_LEN>();
        let password_kek = crypto::derive_key(password.as_bytes(), &password_salt, self.kdf)?;
        let recovery_kek = crypto::derive_key(recovery_plain.as_bytes(), &recovery_salt, self.kdf)?;

        let header = Header {
            version: 1,
            kdf: self.kdf,
            password_salt: B64.encode(password_salt),
            password_wrap: B64.encode(crypto::seal(&password_kek, "wrap:password", data_key.as_ref())?),
            recovery_salt: B64.encode(recovery_salt),
            recovery_wrap: B64.encode(crypto::seal(&recovery_kek, "wrap:recovery", data_key.as_ref())?),
            created_at: now_ms(),
        };

        let index = Index { username: username.to_string(), ..Index::default() };
        let session = Session { key: data_key, index, notes: BTreeMap::new() };
        session.save_index(self)?;
        self.write_header(&header)?;
        Ok((session, recovery_key))
    }

    fn open_password(&self, password: &str) -> Result<(Header, Key)> {
        let header = self.read_header()?;
        let kek = crypto::derive_key(password.as_bytes(), &decode(&header.password_salt)?, header.kdf)?;
        let key = unwrap_key(&kek, "wrap:password", &header.password_wrap).map_err(|e| match e {
            Error::Decrypt => Error::WrongPassword,
            e => e,
        })?;
        Ok((header, key))
    }

    /// Derives the key from the password and decrypts everything into memory.
    pub fn unlock(&self, password: &str) -> Result<(Session, UnlockReport)> {
        let (_, key) = self.open_password(password)?;
        self.load(key)
    }

    /// Opens the vault with the recovery key and sets a new password.
    pub fn recover(&self, recovery_key: &str, new_password: &str) -> Result<(Session, UnlockReport)> {
        if !text::password_is_strong(new_password) {
            return Err(Error::WeakPassword);
        }
        let mut header = self.read_header()?;
        let normalized = crypto::normalize_recovery_key(recovery_key).ok_or(Error::WrongRecoveryKey)?;
        let kek = crypto::derive_key(normalized.as_bytes(), &decode(&header.recovery_salt)?, header.kdf)?;
        let key = unwrap_key(&kek, "wrap:recovery", &header.recovery_wrap).map_err(|e| match e {
            Error::Decrypt => Error::WrongRecoveryKey,
            e => e,
        })?;
        self.rewrap_password(&mut header, &key, new_password)?;
        self.load(key)
    }

    /// Checks the current password, then re-wraps the data key with the new one.
    pub fn change_password(&self, current: &str, new_password: &str) -> Result<()> {
        if !text::password_is_strong(new_password) {
            return Err(Error::WeakPassword);
        }
        let (mut header, key) = self.open_password(current)?;
        self.rewrap_password(&mut header, &key, new_password)
    }

    /// Checks the password without opening anything.
    pub fn verify_password(&self, password: &str) -> Result<()> {
        self.open_password(password).map(|_| ())
    }

    /// Erases this vault from the disk. The header goes first: it holds the only
    /// copies of the wrapped data key, so from that moment nothing left behind
    /// can be decrypted, even if a file below turns out to be locked.
    pub fn destroy(&self) -> Result<()> {
        fs::remove_file(self.dir.join(HEADER_FILE))?;
        let _ = fs::remove_dir_all(&self.dir);
        Ok(())
    }

    /// Issues a new recovery key (after checking the password). The old one stops working.
    pub fn regenerate_recovery_key(&self, password: &str) -> Result<Zeroizing<String>> {
        let (mut header, key) = self.open_password(password)?;
        let recovery_key = crypto::generate_recovery_key();
        let plain = crypto::normalize_recovery_key(&recovery_key).ok_or(Error::Crypto)?;
        let salt = crypto::random_bytes::<SALT_LEN>();
        let recovery_kek = crypto::derive_key(plain.as_bytes(), &salt, header.kdf)?;
        header.recovery_salt = B64.encode(salt);
        header.recovery_wrap = B64.encode(crypto::seal(&recovery_kek, "wrap:recovery", key.as_ref())?);
        self.write_header(&header)?;
        Ok(recovery_key)
    }

    fn rewrap_password(&self, header: &mut Header, key: &Key, new_password: &str) -> Result<()> {
        let salt = crypto::random_bytes::<SALT_LEN>();
        // Both wraps share the header's KDF parameters, so keep them unchanged.
        let kek = crypto::derive_key(new_password.as_bytes(), &salt, header.kdf)?;
        header.password_salt = B64.encode(salt);
        header.password_wrap = B64.encode(crypto::seal(&kek, "wrap:password", key.as_ref())?);
        self.write_header(header)
    }

    fn load(&self, key: Key) -> Result<(Session, UnlockReport)> {
        let index: Index = match fs::read(self.dir.join(INDEX_FILE)) {
            Ok(bytes) => serde_json::from_slice(&crypto::open(&key, "index", &bytes)?)?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Index::default(),
            Err(e) => return Err(e.into()),
        };
        fs::create_dir_all(self.notes_dir())?;
        let mut notes = BTreeMap::new();
        let mut unreadable = 0;
        for entry in fs::read_dir(self.notes_dir())? {
            let path = entry?.path();
            if path.extension().and_then(|e| e.to_str()) != Some(EXT) {
                continue;
            }
            let Some(id) = path.file_stem().and_then(|s| s.to_str()).map(str::to_owned) else {
                continue;
            };
            let parsed = fs::read(&path)
                .map_err(Error::from)
                .and_then(|b| crypto::open(&key, &format!("note:{id}"), &b))
                .and_then(|plain| serde_json::from_slice::<Note>(&plain).map_err(Error::from));
            match parsed {
                Ok(note) if note.id == id => {
                    notes.insert(id, note);
                }
                _ => unreadable += 1,
            }
        }
        let username = index.username.clone();
        let display_name = index.display_name.clone();
        let mut session = Session { key, index, notes };
        // Only tidy up when every note was readable, so nothing a damaged note
        // still points to is ever removed, and no sub-page loses a parent that
        // is merely unreadable today.
        if unreadable == 0 {
            let _ = session.repair_tree(self);
            let _ = session.collect_attachments(self);
        }
        Ok((session, UnlockReport { unreadable_notes: unreadable, username, display_name }))
    }
}

fn decode(b64: &str) -> Result<Vec<u8>> {
    B64.decode(b64).map_err(|_| Error::Corrupted)
}

fn unwrap_key(kek: &Key, context: &str, wrapped_b64: &str) -> Result<Key> {
    let plain = crypto::open(kek, context, &decode(wrapped_b64)?)?;
    let bytes: [u8; crypto::KEY_LEN] = plain.as_slice().try_into().map_err(|_| Error::Corrupted)?;
    Ok(Zeroizing::new(bytes))
}

/// Writes through a temporary file and renames it, so a crash never leaves a
/// half-written file behind.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("tmp");
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    rename_with_retry(&tmp, path)?;
    Ok(())
}

/// Antivirus and the search indexer can hold a just-written file for a moment,
/// which makes Windows refuse the rename; that is worth a short wait, not a
/// failed save.
fn rename_with_retry(from: &Path, to: &Path) -> std::io::Result<()> {
    let mut attempt = 0;
    loop {
        match fs::rename(from, to) {
            Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied && attempt < 5 => {
                std::thread::sleep(Duration::from_millis(20 << attempt));
                attempt += 1;
            }
            result => return result,
        }
    }
}

// ── Session (memory) ─────────────────────────────────────────────────────────

/// The unlocked vault. Dropping it wipes the data key from memory.
pub struct Session {
    key: Key,
    index: Index,
    notes: BTreeMap<String, Note>,
}

impl Session {
    fn save_index(&self, vault: &Vault) -> Result<()> {
        let plain = Zeroizing::new(serde_json::to_vec(&self.index)?);
        write_atomic(&vault.dir.join(INDEX_FILE), &crypto::seal(&self.key, "index", &plain)?)
    }

    fn save_note(&self, vault: &Vault, note: &Note) -> Result<()> {
        let plain = Zeroizing::new(serde_json::to_vec(note)?);
        if plain.len() > MAX_CONTENT_BYTES {
            return Err(Error::Invalid("note is too large"));
        }
        let sealed = crypto::seal(&self.key, &format!("note:{}", note.id), &plain)?;
        write_atomic(&vault.note_path(&note.id), &sealed)
    }

    pub fn username(&self) -> &str {
        &self.index.username
    }

    pub fn set_username(&mut self, vault: &Vault, username: &str) -> Result<()> {
        self.index.username = username.to_string();
        self.save_index(vault)
    }

    pub fn display_name(&self) -> &str {
        &self.index.display_name
    }

    pub fn set_display_name(&mut self, vault: &Vault, name: &str) -> Result<String> {
        let name = name.split_whitespace().collect::<Vec<_>>().join(" ");
        if name.chars().count() > 60 || name.chars().any(char::is_control) {
            return Err(Error::Invalid("name"));
        }
        self.index.display_name = name.clone();
        self.save_index(vault)?;
        Ok(name)
    }

    pub fn settings(&self) -> VaultSettings {
        self.index.settings.clone()
    }

    pub fn set_settings(&mut self, vault: &Vault, patch: SettingsPatch) -> Result<VaultSettings> {
        if let Some(minutes) = patch.auto_lock_minutes {
            if minutes > 24 * 60 {
                return Err(Error::Invalid("auto-lock"));
            }
            self.index.settings.auto_lock_minutes = minutes;
        }
        if let Some(tours) = patch.tours_seen {
            if tours.len() > 32 || tours.iter().any(|t| t.len() > 32) {
                return Err(Error::Invalid("tours"));
            }
            self.index.settings.tours_seen = tours;
        }
        if let Some(language) = patch.dictation_language {
            if !matches!(language.as_str(), "ar" | "fr" | "en") {
                return Err(Error::Invalid("dictation language"));
            }
            self.index.settings.dictation_language = Some(language);
        }
        self.save_index(vault)?;
        Ok(self.settings())
    }

    // Notes

    pub fn list(&self) -> Vec<NoteSummary> {
        let mut out: Vec<NoteSummary> = self.notes.values().map(NoteSummary::from).collect();
        out.sort_by_key(|n| Reverse(n.updated_at));
        out
    }

    pub fn all_notes(&self) -> Vec<Note> {
        self.notes.values().cloned().collect()
    }

    pub fn get(&self, id: &str) -> Result<Note> {
        self.notes.get(id).cloned().ok_or(Error::NotFound)
    }

    fn empty_doc() -> Value {
        serde_json::json!({ "type": "doc", "content": [{ "type": "paragraph" }] })
    }

    pub fn create(&mut self, vault: &Vault, new: NewNote) -> Result<Note> {
        // A sub-page sits in its parent's folder.
        let folder_id = match new.parent_id.as_deref() {
            Some(parent) => self.live_note(parent)?.folder_id.clone(),
            None => new.folder_id.filter(|f| self.index.folders.iter().any(|x| &x.id == f)),
        };
        let now = now_ms();
        let note = Note {
            id: uuid::Uuid::new_v4().to_string(),
            title: new.title.unwrap_or_default().chars().take(MAX_TITLE).collect(),
            content: Self::empty_doc(),
            text: String::new(),
            folder_id,
            parent_id: new.parent_id,
            pinned: false,
            date: new.date.filter(|d| valid_date(d)),
            journal: new.journal,
            icon: None,
            trashed_at: None,
            created_at: now,
            updated_at: now,
        };
        self.save_note(vault, &note)?;
        self.notes.insert(note.id.clone(), note.clone());
        Ok(note)
    }

    /// A page that exists and is not in the trash.
    fn live_note(&self, id: &str) -> Result<&Note> {
        self.notes.get(id).filter(|n| n.trashed_at.is_none()).ok_or(Error::NotFound)
    }

    /// Every page below `id`, at any depth. A broken tree cannot loop here.
    fn descendants(&self, id: &str) -> Vec<String> {
        let mut children: HashMap<&str, Vec<&str>> = HashMap::new();
        for note in self.notes.values() {
            if let Some(parent) = &note.parent_id {
                children.entry(parent).or_default().push(&note.id);
            }
        }
        let mut seen = HashSet::from([id]);
        let mut out = Vec::new();
        let mut stack = vec![id];
        while let Some(at) = stack.pop() {
            for &child in children.get(at).into_iter().flatten() {
                if seen.insert(child) {
                    out.push(child.to_string());
                    stack.push(child);
                }
            }
        }
        out
    }

    /// Lifts to the top level any page whose parent is gone or which sits in a
    /// loop (only a hand-edited backup can make one).
    fn repair_tree(&mut self, vault: &Vault) -> Result<()> {
        let ids: Vec<String> = self.notes.keys().cloned().collect();
        for id in ids {
            let mut seen = HashSet::from([id.as_str()]);
            let mut at = self.notes[&id].parent_id.as_deref();
            let mut broken = false;
            while let Some(parent) = at {
                match self.notes.get(parent) {
                    Some(n) if seen.insert(n.id.as_str()) => at = n.parent_id.as_deref(),
                    _ => {
                        broken = true;
                        break;
                    }
                }
            }
            if broken {
                let mut note = self.notes[&id].clone();
                note.parent_id = None;
                self.save_note(vault, &note)?;
                self.notes.insert(id, note);
            }
        }
        Ok(())
    }

    /// Moving a page takes its sub-pages to the same folder.
    fn move_family(&mut self, vault: &Vault, id: &str, folder: &Option<String>) -> Result<()> {
        for child in self.descendants(id) {
            if let Some(mut note) = self.notes.get(&child).cloned() {
                if note.folder_id != *folder {
                    note.folder_id = folder.clone();
                    self.save_note(vault, &note)?;
                    self.notes.insert(child, note);
                }
            }
        }
        Ok(())
    }

    pub fn update(&mut self, vault: &Vault, id: &str, patch: NotePatch) -> Result<NoteSummary> {
        if let Some(Some(folder)) = &patch.folder_id {
            if !self.index.folders.iter().any(|f| &f.id == folder) {
                return Err(Error::NotFound);
            }
        }
        if let Some(Some(date)) = &patch.date {
            if !valid_date(date) {
                return Err(Error::Invalid("date"));
            }
        }
        if let Some(Some(icon)) = &patch.icon {
            if !valid_icon(icon) {
                return Err(Error::Invalid("icon"));
            }
        }
        let mut note = self.notes.get(id).cloned().ok_or(Error::NotFound)?;
        // Nesting a page inside itself or its own sub-pages would lose the branch.
        let mut parent_folder = None;
        if let Some(Some(parent)) = &patch.parent_id {
            if parent == id || self.descendants(id).contains(parent) {
                return Err(Error::Invalid("parent"));
            }
            parent_folder = Some(self.live_note(parent)?.folder_id.clone());
        }
        let mut touched = false;
        if let Some(title) = patch.title {
            note.title = title.chars().take(MAX_TITLE).collect();
            touched = true;
        }
        if let Some(content) = patch.content {
            if content.get("type").and_then(Value::as_str) != Some("doc") {
                return Err(Error::Invalid("content"));
            }
            note.content = content;
            touched = true;
        }
        if let Some(text) = patch.text {
            note.text = text;
        }
        if let Some(parent) = patch.parent_id {
            note.parent_id = parent;
        }
        let new_folder = parent_folder.or(patch.folder_id);
        if let Some(folder) = &new_folder {
            note.folder_id = folder.clone();
        }
        if let Some(pinned) = patch.pinned {
            note.pinned = pinned;
        }
        if let Some(date) = patch.date {
            note.date = date;
        }
        if let Some(journal) = patch.journal {
            note.journal = journal;
        }
        if let Some(icon) = patch.icon {
            note.icon = icon;
        }
        // Moving or pinning is not an edit; only writing changes "updated".
        if touched {
            note.updated_at = now_ms();
        }
        self.save_note(vault, &note)?;
        let summary = NoteSummary::from(&note);
        self.notes.insert(note.id.clone(), note);
        if let Some(folder) = &new_folder {
            self.move_family(vault, id, folder)?;
        }
        Ok(summary)
    }

    pub fn duplicate(&mut self, vault: &Vault, id: &str) -> Result<Note> {
        let source = self.notes.get(id).ok_or(Error::NotFound)?;
        let now = now_ms();
        let note = Note {
            id: uuid::Uuid::new_v4().to_string(),
            pinned: false,
            // One journal entry per day: the copy is an ordinary page.
            journal: false,
            trashed_at: None,
            created_at: now,
            updated_at: now,
            ..source.clone()
        };
        self.save_note(vault, &note)?;
        self.notes.insert(note.id.clone(), note.clone());
        Ok(note)
    }

    /// Trashes or restores a page with its sub-pages. A restore brings back
    /// only those that went with it, not ones trashed on their own earlier.
    pub fn set_trashed(&mut self, vault: &Vault, id: &str, trashed: bool) -> Result<NoteSummary> {
        let previous = self.notes.get(id).ok_or(Error::NotFound)?.trashed_at;
        let family = self.descendants(id).into_iter().filter(|d| {
            let at = self.notes[d].trashed_at;
            if trashed { at.is_none() } else { at == previous }
        });
        let ids: Vec<String> = std::iter::once(id.to_string()).chain(family).collect();
        let at = trashed.then(now_ms);
        for note_id in ids {
            let Some(mut note) = self.notes.get(&note_id).cloned() else { continue };
            note.trashed_at = at;
            if trashed {
                note.pinned = false;
            }
            // A restored note whose folder was deleted goes back to the top level.
            if let Some(f) = &note.folder_id {
                if !self.index.folders.iter().any(|x| &x.id == f) {
                    note.folder_id = None;
                }
            }
            // So does one whose parent page is gone or still in the trash.
            if !trashed && note_id == id {
                if let Some(parent) = note.parent_id.as_deref() {
                    if self.live_note(parent).is_err() {
                        note.parent_id = None;
                    }
                }
            }
            self.save_note(vault, &note)?;
            self.notes.insert(note_id, note);
        }
        self.notes.get(id).map(NoteSummary::from).ok_or(Error::NotFound)
    }

    fn remove_note_file(&mut self, vault: &Vault, id: &str) -> Result<()> {
        if !self.notes.contains_key(id) {
            return Err(Error::NotFound);
        }
        // The disk first: a failure here must not hide a note that still exists.
        match fs::remove_file(vault.note_path(id)) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => return Err(e.into()),
            _ => {}
        }
        self.notes.remove(id);
        Ok(())
    }

    /// Deletes a page for good, with the sub-pages trashed along with it.
    pub fn delete(&mut self, vault: &Vault, id: &str) -> Result<()> {
        let family = self.descendants(id);
        self.remove_note_file(vault, id)?;
        for child in family {
            if self.notes.get(&child).is_some_and(|n| n.trashed_at.is_some()) {
                self.remove_note_file(vault, &child)?;
            }
        }
        self.repair_tree(vault)?;
        self.collect_attachments(vault)?;
        Ok(())
    }

    pub fn empty_trash(&mut self, vault: &Vault) -> Result<usize> {
        let ids: Vec<String> =
            self.notes.values().filter(|n| n.trashed_at.is_some()).map(|n| n.id.clone()).collect();
        for id in &ids {
            self.remove_note_file(vault, id)?;
        }
        self.repair_tree(vault)?;
        self.collect_attachments(vault)?;
        Ok(ids.len())
    }

    /// Creates notes (and missing folders, matched by name) in one go.
    pub fn import(&mut self, vault: &Vault, batch: Vec<ImportNote>) -> Result<usize> {
        let batch: Vec<ImportNote> =
            batch.into_iter().filter(|n| n.content.get("type").and_then(Value::as_str) == Some("doc")).collect();

        // Folders are written first: a note must never point at a folder that
        // did not reach the disk, even if a later note fails.
        let mut folder_ids = Vec::with_capacity(batch.len());
        let mut index_changed = false;
        for item in &batch {
            let Some(name) = item.folder.as_deref().map(str::trim).filter(|f| !f.is_empty()) else {
                folder_ids.push(None);
                continue;
            };
            let name: String = name.chars().take(MAX_FOLDER_NAME).collect();
            let id = match self.index.folders.iter().find(|f| f.name == name) {
                Some(f) => f.id.clone(),
                None => {
                    let f = Folder { id: uuid::Uuid::new_v4().to_string(), name, created_at: now_ms(), pinned: false };
                    let id = f.id.clone();
                    self.index.folders.push(f);
                    index_changed = true;
                    id
                }
            };
            folder_ids.push(Some(id));
        }
        if index_changed {
            self.save_index(vault)?;
        }

        let mut count = 0;
        for (item, folder_id) in batch.into_iter().zip(folder_ids) {
            let now = now_ms();
            let id = item
                .id
                .as_deref()
                .and_then(|id| uuid::Uuid::parse_str(id).ok())
                .map(|id| id.to_string())
                .filter(|id| !self.notes.contains_key(id))
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
            let note = Note {
                id,
                title: item.title.chars().take(MAX_TITLE).collect(),
                content: item.content,
                text: item.text,
                folder_id,
                // The parent may arrive in a later batch; the next unlock
                // lifts any page whose parent never came.
                parent_id: item.parent_id,
                pinned: item.pinned,
                date: item.date.filter(|d| valid_date(d)),
                journal: item.journal,
                icon: item.icon.filter(|i| valid_icon(i)),
                trashed_at: None,
                created_at: item.created_at.unwrap_or(now),
                updated_at: item.updated_at.or(item.created_at).unwrap_or(now),
            };
            self.save_note(vault, &note)?;
            self.notes.insert(note.id.clone(), note);
            count += 1;
        }
        Ok(count)
    }

    pub fn search(&self, query: &str, limit: usize) -> Vec<SearchHit> {
        let needle = text::normalize(query.trim());
        if needle.is_empty() {
            return Vec::new();
        }
        let mut hits: Vec<(u8, SearchHit)> = self
            .notes
            .values()
            .filter(|n| n.trashed_at.is_none())
            .filter_map(|n| {
                let in_title = text::normalize(&n.title).contains(&needle);
                let body = text::snippet(&n.text, &needle, 48);
                if !in_title && body.is_none() {
                    return None;
                }
                let hit = SearchHit {
                    id: n.id.clone(),
                    title: n.title.clone(),
                    snippet: body.unwrap_or_else(|| text::preview(&n.text, 96)),
                    folder_id: n.folder_id.clone(),
                    updated_at: n.updated_at,
                };
                Some((if in_title { 0 } else { 1 }, hit))
            })
            .collect();
        hits.sort_by(|a, b| a.0.cmp(&b.0).then(b.1.updated_at.cmp(&a.1.updated_at)));
        hits.into_iter().take(limit).map(|(_, h)| h).collect()
    }

    // Folders

    pub fn folders(&self) -> Vec<Folder> {
        self.index.folders.clone()
    }

    pub fn create_folder(&mut self, vault: &Vault, name: &str) -> Result<Folder> {
        let folder = Folder { id: uuid::Uuid::new_v4().to_string(), name: clean_name(name)?, created_at: now_ms(), pinned: false };
        self.index.folders.push(folder.clone());
        self.save_index(vault)?;
        Ok(folder)
    }

    pub fn pin_folder(&mut self, vault: &Vault, id: &str, pinned: bool) -> Result<Folder> {
        let folder = self.index.folders.iter_mut().find(|f| f.id == id).ok_or(Error::NotFound)?;
        folder.pinned = pinned;
        let folder = folder.clone();
        self.save_index(vault)?;
        Ok(folder)
    }

    pub fn rename_folder(&mut self, vault: &Vault, id: &str, name: &str) -> Result<Folder> {
        let name = clean_name(name)?;
        let folder = self.index.folders.iter_mut().find(|f| f.id == id).ok_or(Error::NotFound)?;
        folder.name = name;
        let folder = folder.clone();
        self.save_index(vault)?;
        Ok(folder)
    }

    /// Deletes a folder. Its notes move to the top level; nothing is lost.
    pub fn delete_folder(&mut self, vault: &Vault, id: &str) -> Result<()> {
        if !self.index.folders.iter().any(|f| f.id == id) {
            return Err(Error::NotFound);
        }
        let affected: Vec<String> = self
            .notes
            .values()
            .filter(|n| n.folder_id.as_deref() == Some(id))
            .map(|n| n.id.clone())
            .collect();
        for note_id in affected {
            if let Some(mut note) = self.notes.get(&note_id).cloned() {
                note.folder_id = None;
                self.save_note(vault, &note)?;
                self.notes.insert(note_id, note);
            }
        }
        self.index.folders.retain(|f| f.id != id);
        self.save_index(vault)
    }

    // Attachments

    /// Encrypts and stores a file; returns its id.
    pub fn add_attachment(&self, vault: &Vault, bytes: &[u8]) -> Result<String> {
        if bytes.len() > MAX_ATTACHMENT_BYTES {
            return Err(Error::Invalid("file is too large"));
        }
        let id = uuid::Uuid::new_v4().to_string();
        let sealed = crypto::seal(&self.key, &format!("att:{id}"), bytes)?;
        write_atomic(&vault.attachment_path(&id), &sealed)?;
        Ok(id)
    }

    pub fn read_attachment(&self, vault: &Vault, id: &str) -> Result<Zeroizing<Vec<u8>>> {
        if uuid::Uuid::parse_str(id).is_err() {
            return Err(Error::Invalid("attachment id"));
        }
        let sealed = fs::read(vault.attachment_path(id)).map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => Error::NotFound,
            _ => Error::Io(e),
        })?;
        crypto::open(&self.key, &format!("att:{id}"), &sealed)
    }

    /// Removes attachment files no note refers to any more.
    pub fn collect_attachments(&self, vault: &Vault) -> Result<usize> {
        let dir = vault.dir.join(ATTACHMENTS_DIR);
        let Ok(entries) = fs::read_dir(&dir) else { return Ok(0) };
        let mut referenced = HashSet::new();
        for note in self.notes.values() {
            collect_ids(&note.content, &mut referenced);
        }
        let mut removed = 0;
        for entry in entries.flatten() {
            let path = entry.path();
            let Some(id) = path.file_stem().and_then(|s| s.to_str()) else { continue };
            // Freshly added files get a grace period: their note may not be saved yet.
            let young = entry
                .metadata()
                .and_then(|m| m.modified())
                .map(|t| t.elapsed().map(|e| e.as_secs() < 24 * 3600).unwrap_or(true))
                .unwrap_or(true);
            if !referenced.contains(id) && !young {
                let _ = fs::remove_file(&path);
                removed += 1;
            }
        }
        Ok(removed)
    }
}

fn collect_ids(value: &Value, out: &mut HashSet<String>) {
    match value {
        Value::Object(map) => {
            if let Some(Value::String(id)) = map.get("attachmentId") {
                out.insert(id.clone());
            }
            map.values().for_each(|v| collect_ids(v, out));
        }
        Value::Array(items) => items.iter().for_each(|v| collect_ids(v, out)),
        _ => {}
    }
}

fn clean_name(name: &str) -> Result<String> {
    let name: String = name.trim().chars().take(MAX_FOLDER_NAME).collect();
    if name.is_empty() {
        return Err(Error::Invalid("name"));
    }
    Ok(name)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PW: &str = "Correct-Horse-9";

    fn vault() -> (tempfile::TempDir, Vault) {
        let dir = tempfile::tempdir().unwrap();
        let v = Vault::with_kdf(dir.path().to_path_buf(), KdfParams { m_cost: 1024, t_cost: 1, p_cost: 1 });
        (dir, v)
    }

    fn patch_title(title: &str) -> NotePatch {
        NotePatch { title: Some(title.into()), ..Default::default() }
    }

    #[test]
    fn create_unlock_and_reject_wrong_password() {
        let (_d, v) = vault();
        assert!(!v.exists());
        let (mut s, _rk) = v.create("yassine", PW).unwrap();
        let note = s.create(&v, NewNote::default()).unwrap();
        s.update(&v, &note.id, patch_title("مرحبا")).unwrap();
        drop(s);

        assert!(matches!(v.unlock("Wrong-Password-1"), Err(Error::WrongPassword)));
        let (s, report) = v.unlock(PW).unwrap();
        assert_eq!(report.unreadable_notes, 0);
        assert_eq!(report.username, "yassine");
        assert_eq!(s.get(&note.id).unwrap().title, "مرحبا");
        assert!(matches!(v.create("x", PW), Err(Error::VaultExists)));
    }

    #[test]
    fn weak_passwords_are_refused() {
        let (_d, v) = vault();
        assert!(matches!(v.create("u", "short"), Err(Error::WeakPassword)));
        assert!(!v.exists());
    }

    #[test]
    fn nothing_readable_on_disk() {
        let (d, v) = vault();
        let (mut s, _) = v.create("SecretUser", PW).unwrap();
        let n = s.create(&v, NewNote { date: Some("2026-10-15".into()), journal: true, ..Default::default() }).unwrap();
        s.update(
            &v,
            &n.id,
            NotePatch { title: Some("SecretTitle".into()), text: Some("SecretBody".into()), ..Default::default() },
        )
        .unwrap();
        s.create_folder(&v, "SecretFolder").unwrap();
        s.add_attachment(&v, b"SecretPdf").unwrap();
        for entry in walk(d.path()) {
            let bytes = fs::read(&entry).unwrap();
            let haystack = String::from_utf8_lossy(&bytes);
            for secret in ["SecretTitle", "SecretBody", "SecretFolder", "SecretUser", "SecretPdf", "2026-10-15"] {
                assert!(!haystack.contains(secret), "{secret} leaked in {entry:?}");
            }
        }
    }

    fn walk(dir: &Path) -> Vec<PathBuf> {
        let mut out = Vec::new();
        for e in fs::read_dir(dir).unwrap() {
            let p = e.unwrap().path();
            if p.is_dir() {
                out.extend(walk(&p));
            } else {
                out.push(p);
            }
        }
        out
    }

    #[test]
    fn recovery_key_resets_password() {
        let (_d, v) = vault();
        let (mut s, rk) = v.create("u", PW).unwrap();
        let n = s.create(&v, NewNote::default()).unwrap();
        drop(s);
        assert!(matches!(v.recover("0000-0000-0000-0000-0000-0000", "New-Password-22"), Err(Error::WrongRecoveryKey)));
        let (s, _) = v.recover(&rk.to_lowercase(), "New-Password-22").unwrap();
        assert!(s.get(&n.id).is_ok());
        assert!(matches!(v.unlock(PW), Err(Error::WrongPassword)));
        assert!(v.unlock("New-Password-22").is_ok());
    }

    #[test]
    fn new_recovery_key_replaces_the_old_one() {
        let (_d, v) = vault();
        let (_, old) = v.create("u", PW).unwrap();
        assert!(matches!(v.regenerate_recovery_key("Wrong-Password-1"), Err(Error::WrongPassword)));
        let new = v.regenerate_recovery_key(PW).unwrap();
        assert_ne!(*old, *new);
        assert!(matches!(v.recover(&old, "Fresh-Password-5"), Err(Error::WrongRecoveryKey)));
        assert!(v.recover(&new, "Fresh-Password-5").is_ok());
    }

    #[test]
    fn change_password_keeps_notes() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        let n = s.create(&v, NewNote::default()).unwrap();
        drop(s);
        assert!(matches!(v.change_password("nope-nope-1A", "Another-Pass-3"), Err(Error::WrongPassword)));
        v.change_password(PW, "Another-Pass-3").unwrap();
        let (s, _) = v.unlock("Another-Pass-3").unwrap();
        assert!(s.get(&n.id).is_ok());
    }

    #[test]
    fn swapped_note_files_are_rejected() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        let a = s.create(&v, NewNote::default()).unwrap();
        let b = s.create(&v, NewNote::default()).unwrap();
        drop(s);
        fs::copy(v.note_path(&a.id), v.note_path(&b.id)).unwrap();
        let (s, report) = v.unlock(PW).unwrap();
        assert_eq!(report.unreadable_notes, 1);
        assert!(s.get(&b.id).is_err());
    }

    #[test]
    fn folders_trash_and_search() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        let f = s.create_folder(&v, "  Travaux  ").unwrap();
        assert_eq!(f.name, "Travaux");
        let n = s.create(&v, NewNote { folder_id: Some(f.id.clone()), ..Default::default() }).unwrap();
        s.update(
            &v,
            &n.id,
            NotePatch { title: Some("Réunion".into()), text: Some("كتبتُ المُذكّرة".into()), ..Default::default() },
        )
        .unwrap();
        assert_eq!(s.search("reunion", 10).len(), 1);
        assert_eq!(s.search("المذكرة", 10).len(), 1);

        s.delete_folder(&v, &f.id).unwrap();
        assert_eq!(s.get(&n.id).unwrap().folder_id, None);

        s.set_trashed(&v, &n.id, true).unwrap();
        assert!(s.search("reunion", 10).is_empty());
        assert_eq!(s.empty_trash(&v).unwrap(), 1);
        assert!(s.get(&n.id).is_err());
    }

    #[test]
    fn display_name_is_saved_encrypted() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        assert_eq!(s.set_display_name(&v, "  ياسين   الشلي ").unwrap(), "ياسين الشلي");
        assert!(s.set_display_name(&v, &"x".repeat(61)).is_err());
        drop(s);
        let (_, report) = v.unlock(PW).unwrap();
        assert_eq!(report.display_name, "ياسين الشلي");
    }

    #[test]
    fn settings_patch_keeps_other_fields() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        s.set_settings(&v, SettingsPatch { tours_seen: Some(vec!["home".into()]), ..Default::default() }).unwrap();
        let after = s.set_settings(&v, SettingsPatch { auto_lock_minutes: Some(5), ..Default::default() }).unwrap();
        assert_eq!(after.auto_lock_minutes, 5);
        assert_eq!(after.tours_seen, vec!["home".to_string()]);
    }

    #[test]
    fn date_and_journal_properties() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        let n = s.create(&v, NewNote { date: Some("2026-10-15".into()), journal: true, ..Default::default() }).unwrap();
        assert_eq!(n.date.as_deref(), Some("2026-10-15"));
        assert!(n.journal);
        let bad = NotePatch { date: Some(Some("15/10/2026".into())), ..Default::default() };
        assert!(matches!(s.update(&v, &n.id, bad), Err(Error::Invalid(_))));
        let clear = NotePatch { date: Some(None), journal: Some(false), ..Default::default() };
        let sum = s.update(&v, &n.id, clear).unwrap();
        assert_eq!(sum.date, None);
        assert!(!sum.journal);
    }

    #[test]
    fn import_creates_folders_once() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        let doc = serde_json::json!({ "type": "doc", "content": [] });
        let item = |title: &str, folder: Option<&str>| ImportNote {
            id: None,
            parent_id: None,
            title: title.into(),
            content: doc.clone(),
            text: String::new(),
            folder: folder.map(Into::into),
            date: Some("2025-01-02".into()),
            journal: false,
            pinned: false,
            icon: None,
            created_at: Some(1000),
            updated_at: None,
        };
        let n = s
            .import(&v, vec![item("a", Some("Obsidian")), item("b", Some("Obsidian")), item("c", None)])
            .unwrap();
        assert_eq!(n, 3);
        assert_eq!(s.folders().len(), 1);
        assert!(s.list().iter().all(|x| x.created_at == 1000));
    }

    #[test]
    fn attachments_roundtrip_and_cleanup() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        let id = s.add_attachment(&v, b"%PDF-1.7 data").unwrap();
        assert_eq!(s.read_attachment(&v, &id).unwrap().as_slice(), b"%PDF-1.7 data");
        let n = s.create(&v, NewNote::default()).unwrap();
        let content = serde_json::json!({ "type": "doc", "content": [{ "type": "pdf", "attrs": { "attachmentId": id } }] });
        s.update(&v, &n.id, NotePatch { content: Some(content), ..Default::default() }).unwrap();
        // Referenced and young: kept.
        assert_eq!(s.collect_attachments(&v).unwrap(), 0);
        assert!(s.read_attachment(&v, "../vault").is_err());
    }

    fn sub_page(s: &mut Session, v: &Vault, parent: &str) -> Note {
        s.create(v, NewNote { parent_id: Some(parent.into()), ..Default::default() }).unwrap()
    }

    fn imported(id: &str, parent: Option<&str>) -> ImportNote {
        ImportNote {
            id: Some(id.into()),
            parent_id: parent.map(Into::into),
            title: "x".into(),
            content: serde_json::json!({ "type": "doc", "content": [] }),
            text: String::new(),
            folder: None,
            date: None,
            journal: false,
            pinned: false,
            icon: None,
            created_at: None,
            updated_at: None,
        }
    }

    #[test]
    fn sub_pages_take_the_parents_folder_and_follow_it() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        let (a, b) = (s.create_folder(&v, "A").unwrap(), s.create_folder(&v, "B").unwrap());
        let top = s.create(&v, NewNote { folder_id: Some(a.id.clone()), ..Default::default() }).unwrap();
        let child = sub_page(&mut s, &v, &top.id);
        let grandchild = sub_page(&mut s, &v, &child.id);
        assert_eq!(child.parent_id.as_deref(), Some(top.id.as_str()));
        assert_eq!(grandchild.folder_id.as_deref(), Some(a.id.as_str()));

        s.update(&v, &top.id, NotePatch { folder_id: Some(Some(b.id.clone())), ..Default::default() }).unwrap();
        assert_eq!(s.get(&grandchild.id).unwrap().folder_id.as_deref(), Some(b.id.as_str()));
        drop(s);
        let (s, _) = v.unlock(PW).unwrap();
        assert_eq!(s.get(&grandchild.id).unwrap().parent_id.as_deref(), Some(child.id.as_str()));
    }

    #[test]
    fn a_page_cannot_be_nested_inside_itself() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        let top = s.create(&v, NewNote::default()).unwrap();
        let child = sub_page(&mut s, &v, &top.id);
        let grandchild = sub_page(&mut s, &v, &child.id);
        let nest = |to: &str| NotePatch { parent_id: Some(Some(to.to_string())), ..Default::default() };
        assert!(matches!(s.update(&v, &top.id, nest(&top.id)), Err(Error::Invalid(_))));
        assert!(matches!(s.update(&v, &top.id, nest(&grandchild.id)), Err(Error::Invalid(_))));
        let other = s.create(&v, NewNote::default()).unwrap();
        assert!(s.update(&v, &other.id, nest(&grandchild.id)).is_ok());
        let out = NotePatch { parent_id: Some(None), ..Default::default() };
        assert_eq!(s.update(&v, &other.id, out).unwrap().parent_id, None);
    }

    #[test]
    fn sub_pages_go_to_the_trash_and_back_with_their_parent() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        let top = s.create(&v, NewNote::default()).unwrap();
        let kept = sub_page(&mut s, &v, &top.id);
        let alone = sub_page(&mut s, &v, &top.id);
        s.set_trashed(&v, &alone.id, true).unwrap();
        std::thread::sleep(Duration::from_millis(2));

        s.set_trashed(&v, &top.id, true).unwrap();
        assert!(s.get(&kept.id).unwrap().trashed_at.is_some());
        s.set_trashed(&v, &top.id, false).unwrap();
        assert!(s.get(&kept.id).unwrap().trashed_at.is_none());
        // Trashed on its own earlier: it stays there.
        assert!(s.get(&alone.id).unwrap().trashed_at.is_some());
    }

    #[test]
    fn restoring_a_sub_page_alone_lifts_it_out_of_its_trashed_parent() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        let top = s.create(&v, NewNote::default()).unwrap();
        let child = sub_page(&mut s, &v, &top.id);
        s.set_trashed(&v, &top.id, true).unwrap();
        assert_eq!(s.set_trashed(&v, &child.id, false).unwrap().parent_id, None);
        assert!(s.create(&v, NewNote { parent_id: Some(top.id.clone()), ..Default::default() }).is_err());
    }

    #[test]
    fn deleting_a_parent_deletes_its_trashed_family() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        let top = s.create(&v, NewNote::default()).unwrap();
        let child = sub_page(&mut s, &v, &top.id);
        let free = sub_page(&mut s, &v, &child.id);
        s.set_trashed(&v, &top.id, true).unwrap();
        s.set_trashed(&v, &free.id, false).unwrap();
        s.delete(&v, &top.id).unwrap();
        assert!(s.get(&top.id).is_err() && s.get(&child.id).is_err());
        assert_eq!(s.get(&free.id).unwrap().parent_id, None);
        assert!(!v.note_path(&child.id).exists());
    }

    #[test]
    fn a_broken_tree_is_repaired_on_unlock() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        let (a, b, orphan) = (uuid::Uuid::new_v4().to_string(), uuid::Uuid::new_v4().to_string(), uuid::Uuid::new_v4().to_string());
        s.import(&v, vec![imported(&a, Some(&b)), imported(&b, Some(&a)), imported(&orphan, Some("gone"))]).unwrap();
        assert_eq!(s.get(&a).unwrap().id, a);
        drop(s);
        let (s, _) = v.unlock(PW).unwrap();
        assert_eq!(s.get(&orphan).unwrap().parent_id, None);
        let linked = [&a, &b].iter().filter(|id| s.get(id).unwrap().parent_id.is_some()).count();
        assert_eq!(linked, 1, "exactly one link of the loop is cut");
    }

    #[test]
    fn import_refuses_ids_that_are_not_uuids() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        s.import(&v, vec![imported("../../evil", None)]).unwrap();
        assert!(uuid::Uuid::parse_str(&s.list()[0].id).is_ok());
    }

    #[test]
    fn duplicate_of_a_journal_entry_is_an_ordinary_page() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        let n = s.create(&v, NewNote { date: Some("2026-10-15".into()), journal: true, ..Default::default() }).unwrap();
        assert!(!s.duplicate(&v, &n.id).unwrap().journal);
    }

    #[test]
    fn destroy_leaves_nothing_behind() {
        let (d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        s.create(&v, NewNote::default()).unwrap();
        s.add_attachment(&v, b"%PDF").unwrap();
        assert!(matches!(v.verify_password("Wrong-Password-1"), Err(Error::WrongPassword)));
        v.verify_password(PW).unwrap();
        v.destroy().unwrap();
        assert!(!v.exists());
        assert!(!d.path().exists() || walk(d.path()).is_empty());
        assert!(matches!(v.unlock(PW), Err(Error::NoVault)));
    }

    #[test]
    fn dictation_language_is_checked_and_kept() {
        let (_d, v) = vault();
        let (mut s, _) = v.create("u", PW).unwrap();
        let set = |l: &str| SettingsPatch { dictation_language: Some(l.into()), ..Default::default() };
        assert!(s.set_settings(&v, set("de")).is_err());
        assert_eq!(s.set_settings(&v, set("fr")).unwrap().dictation_language.as_deref(), Some("fr"));
        drop(s);
        let (s, _) = v.unlock(PW).unwrap();
        assert_eq!(s.settings().dictation_language.as_deref(), Some("fr"));
    }

    #[test]
    fn patch_distinguishes_missing_and_null() {
        let p: NotePatch = serde_json::from_str(r#"{"pinned":true}"#).unwrap();
        assert!(p.folder_id.is_none());
        let p: NotePatch = serde_json::from_str(r#"{"folderId":null}"#).unwrap();
        assert_eq!(p.folder_id, Some(None));
    }
}
