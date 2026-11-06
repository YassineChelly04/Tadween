// Import from Obsidian, Notion, Markdown or a Tadween backup; export everything
// as Markdown plus a full-fidelity backup. File access happens in Rust behind
// native dialogs; this module converts between files and editor documents.

import { generateJSON, type JSONContent } from '@tiptap/core';
import { marked } from 'marked';
import { api, type ExportEntry, type Folder, type ImportFile, type ImportMode, type ImportNote, type Note } from './api';
import { cleanNotionCell, parseCsv, sheetDocs } from './sheets';
import { isoDate } from './dates';
import { createExtensions } from '../features/editor/extensions';

// ── Export ───────────────────────────────────────────────────────────────────

const BACKUP_FILE = 'tadween-backup.json';

function safeName(name: string, fallback: string): string {
  const clean = name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  return clean || fallback;
}

function uniquePath(base: string, ext: string, used: Set<string>): string {
  let path = `${base}.${ext}`;
  for (let i = 2; used.has(path.toLowerCase()); i++) path = `${base} (${i}).${ext}`;
  used.add(path.toLowerCase());
  return path;
}

export interface Assets {
  entries: ExportEntry[];
  used: Set<string>;
  images: Map<string, string>;
  /** Page titles by id, for the links between pages. */
  titles?: Map<string, string>;
}

function imagePath(src: string, assets: Assets): string | null {
  const m = /^data:image\/([a-z0-9+.-]+);base64,(.*)$/i.exec(src);
  if (!m) return null;
  const known = assets.images.get(src);
  if (known) return known;
  const ext = m[1] === 'svg+xml' ? 'svg' : m[1] === 'jpeg' ? 'jpg' : m[1];
  const path = uniquePath(`assets/image-${assets.images.size + 1}`, ext, assets.used);
  assets.entries.push({ path: `Markdown/${path}`, base64: m[2] });
  assets.images.set(src, path);
  return path;
}

function inline(nodes: JSONContent[] | undefined): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === 'hardBreak') return '  \n';
      if (n.type !== 'text') return '';
      let text = (n.text ?? '').replace(/([*_`~\\[\]])/g, '\\$1');
      for (const mark of n.marks ?? []) {
        if (mark.type === 'code') text = '`' + (n.text ?? '') + '`';
        if (mark.type === 'bold') text = `**${text}**`;
        if (mark.type === 'italic') text = `*${text}*`;
        if (mark.type === 'strike') text = `~~${text}~~`;
        if (mark.type === 'highlight') text = `==${text}==`;
        if (mark.type === 'underline') text = `<u>${text}</u>`;
        if (mark.type === 'link') text = `[${text}](${mark.attrs?.href ?? ''})`;
      }
      return text;
    })
    .join('');
}

/** Editor document → Markdown (GFM, plus Obsidian callouts and highlights). */
export function toMarkdown(doc: JSONContent, assets: Assets, depthPrefix = '../'): string {
  const block = (n: JSONContent, indent = ''): string => {
    const kids = n.content ?? [];
    switch (n.type) {
      case 'paragraph':
        return indent + inline(kids);
      case 'heading':
        return `${'#'.repeat(n.attrs?.level ?? 1)} ${inline(kids)}`;
      case 'bulletList':
        return kids.map((li) => listItem(li, indent, '- ')).join('\n');
      case 'orderedList':
        return kids.map((li, i) => listItem(li, indent, `${(n.attrs?.start ?? 1) + i}. `)).join('\n');
      case 'taskList':
        return kids.map((li) => listItem(li, indent, li.attrs?.checked ? '- [x] ' : '- [ ] ')).join('\n');
      case 'blockquote':
        return kids.map((k) => block(k)).join('\n\n').split('\n').map((l) => `> ${l}`).join('\n');
      case 'callout':
        return ['[!note]', ...kids.map((k) => block(k))].join('\n').split('\n').map((l) => `> ${l}`).join('\n');
      case 'codeBlock':
        return '```' + (n.attrs?.language ?? '') + '\n' + kids.map((k) => k.text ?? '').join('') + '\n```';
      case 'horizontalRule':
        return '---';
      case 'image': {
        const path = imagePath(n.attrs?.src ?? '', assets);
        return path ? `![${n.attrs?.alt ?? ''}](${depthPrefix}${encodeURI(path)})` : '';
      }
      case 'pdf': {
        const name = safeName(n.attrs?.name ?? 'document', 'document').replace(/\.pdf$/i, '');
        const path = uniquePath(`assets/${name}`, 'pdf', assets.used);
        assets.entries.push({ path: `Markdown/${path}`, attachmentId: n.attrs?.attachmentId });
        return `[${n.attrs?.name ?? 'PDF'}](${depthPrefix}${encodeURI(path)})`;
      }
      case 'pageLink':
        return `[[${assets.titles?.get(n.attrs?.pageId) || 'Untitled'}]]`;
      case 'table': {
        const rows = kids.map((row) => (row.content ?? []).map((cell) => (cell.content ?? []).map((p) => inline(p.content)).join(' ').replace(/\|/g, '\\|')));
        if (!rows.length) return '';
        const width = Math.max(...rows.map((r) => r.length));
        const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
        return [line(rows[0]), `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
      }
      case 'details': {
        const summary = kids.find((k) => k.type === 'detailsSummary');
        const body = kids.find((k) => k.type === 'detailsContent');
        return `<details>\n<summary>${inline(summary?.content)}</summary>\n\n${(body?.content ?? []).map((k) => block(k)).join('\n\n')}\n</details>`;
      }
      case 'columns':
        return kids.map((col) => (col.content ?? []).map((k) => block(k)).join('\n\n')).join('\n\n');
      default:
        return kids.map((k) => block(k, indent)).join('\n\n');
    }
  };
  const listItem = (li: JSONContent, indent: string, bullet: string): string => {
    const [first, ...rest] = li.content ?? [];
    const head = indent + bullet + (first ? block(first) : '');
    const tail = rest.map((k) => block(k, indent + '    ')).join('\n');
    return tail ? `${head}\n${tail}` : head;
  };
  return (doc.content ?? []).map((n) => block(n)).filter(Boolean).join('\n\n') + '\n';
}

function frontMatter(n: Note, folder: Folder | undefined): string {
  const lines = ['---', `title: ${JSON.stringify(n.title)}`];
  if (n.date) lines.push(`date: ${n.date}`);
  if (n.journal) lines.push('journal: true');
  if (n.pinned) lines.push('pinned: true');
  if (n.icon) lines.push(`icon: ${n.icon}`);
  if (folder) lines.push(`folder: ${JSON.stringify(folder.name)}`);
  lines.push(`created: ${new Date(n.createdAt).toISOString()}`, `updated: ${new Date(n.updatedAt).toISOString()}`, '---', '');
  return lines.join('\n');
}

/** Exports every page. Returns the saved path, or null when cancelled. */
export async function exportEverything(): Promise<{ path: string; count: number; missing: number } | null> {
  const { notes, folders } = await api.exportAll();
  const live = notes.filter((n) => !n.trashedAt);
  const assets: Assets = { entries: [], used: new Set(), images: new Map(), titles: new Map(live.map((n) => [n.id, n.title])) };
  const entries: ExportEntry[] = [];
  const usedNames = new Set<string>();

  for (const n of live) {
    const folder = folders.find((f) => f.id === n.folderId);
    const dir = folder ? `Markdown/${safeName(folder.name, 'Folder')}` : 'Markdown';
    const path = uniquePath(`${dir}/${safeName(n.title, 'Untitled')}`, 'md', usedNames);
    const md = toMarkdown(n.content, assets, folder ? '../' : '');
    entries.push({ path, text: frontMatter(n, folder) + (n.title ? `# ${n.title}\n\n` : '') + md });
  }

  // Full-fidelity copy for moving to another Tadween; attachments travel with it.
  const attachmentIds = new Set<string>();
  const walk = (node: JSONContent) => {
    if (node.type === 'pdf' && node.attrs?.attachmentId) attachmentIds.add(node.attrs.attachmentId);
    node.content?.forEach(walk);
  };
  live.forEach((n) => walk(n.content));
  entries.push({ path: BACKUP_FILE, text: JSON.stringify({ format: 'tadween', version: 1, exportedAt: Date.now(), folders, notes: live }) });
  attachmentIds.forEach((id) => entries.push({ path: `attachments/${id}.pdf`, attachmentId: id }));

  const saved = await api.exportSave(`Tadween ${isoDate(new Date())}.zip`, [...entries, ...assets.entries]);
  return saved ? { path: saved.path, count: live.length, missing: saved.missing } : null;
}

// ── Import ───────────────────────────────────────────────────────────────────

let extensions: ReturnType<typeof createExtensions> | null = null;
const schemaExtensions = () => (extensions ??= createExtensions('ltr'));

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

/** "Meeting notes 1f2e3d4c5b6a79881f2e3d4c5b6a7988" → "Meeting notes" (Notion). */
function cleanTitle(name: string): string {
  return stripExt(name).replace(/\s+[0-9a-f]{32}$/i, '').trim();
}

function resolve(fromDir: string, href: string): string {
  let target: string;
  try {
    target = decodeURIComponent(href.split('#')[0].split('?')[0]);
  } catch {
    target = href;
  }
  const parts = (target.startsWith('/') ? target.slice(1) : `${fromDir}/${target}`).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

interface FrontMatter {
  title?: string;
  date?: string;
  journal?: boolean;
  pinned?: boolean;
  folder?: string;
  created?: number;
  updated?: number;
}

function parseFrontMatter(text: string): { meta: FrontMatter; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta: FrontMatter = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1].toLowerCase();
    let value = kv[2].trim();
    if (/^".*"$/.test(value)) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    } else if (/^'.*'$/.test(value)) value = value.slice(1, -1);
    const time = Date.parse(value);
    if (key === 'title') meta.title = value;
    else if (key === 'date' || key === 'day') {
      const d = /\d{4}-\d{2}-\d{2}/.exec(value);
      if (d) meta.date = d[0];
    } else if (key === 'journal') meta.journal = value === 'true';
    else if (key === 'pinned') meta.pinned = value === 'true';
    else if (key === 'folder') meta.folder = value;
    else if ((key === 'created' || key === 'created_at' || key === 'creation date') && !isNaN(time)) meta.created = time;
    else if ((key === 'updated' || key === 'modified' || key === 'last edited time') && !isNaN(time)) meta.updated = time;
  }
  return { meta, body: text.slice(m[0].length) };
}

export interface Lookup {
  byPath: Map<string, ImportFile>;
  byName: Map<string, ImportFile>;
}

function pdfHtml(f: ImportFile, label?: string): string {
  const name = (label || basename(f.path)).replace(/"/g, '&quot;');
  return `<div data-pdf data-attachment-id="${f.attachmentId}" data-name="${name}" data-size="${f.size}"></div>`;
}

/** Obsidian syntax → plain Markdown/HTML that marked understands. */
function obsidianToMarkdown(md: string, lookup: Lookup): string {
  return (
    md
      // ![[image.png|300]] and ![[file.pdf]]
      .replace(/!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, target: string, alias?: string) => {
        const f = lookup.byName.get(basename(target.trim()).toLowerCase());
        if (!f) return alias ?? target;
        if (f.kind === 'image' && f.dataUrl) return `\n\n<img src="${f.dataUrl}" alt="${alias ?? ''}">\n\n`;
        if (f.kind === 'pdf' && f.attachmentId) return `\n\n${pdfHtml(f)}\n\n`;
        return alias ?? target;
      })
      // [[Note|alias]] and [[Note#heading]]
      .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, target: string, alias?: string) => alias ?? target)
      // ==highlight==
      .replace(/==([^=\n]+)==/g, '<mark>$1</mark>')
      // %% comments %%
      .replace(/%%[\s\S]*?%%/g, '')
  );
}

/** Fixes up rendered HTML: local images, PDFs, task lists, Obsidian callouts. */
function postProcess(html: string, fromDir: string, lookup: Lookup): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');

  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? '';
    if (src.startsWith('data:image/')) return;
    const f = lookup.byPath.get(resolve(fromDir, src).toLowerCase()) ?? lookup.byName.get(basename(resolve(fromDir, src)).toLowerCase());
    if (f?.kind === 'image' && f.dataUrl) img.setAttribute('src', f.dataUrl);
    else img.remove(); // remote or missing images: Tadween stays offline
  });

  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (/^[a-z]+:/i.test(href)) return;
    const f = lookup.byPath.get(resolve(fromDir, href).toLowerCase()) ?? lookup.byName.get(basename(resolve(fromDir, href)).toLowerCase());
    if (f?.kind === 'pdf' && f.attachmentId) {
      const holder = doc.createElement('div');
      holder.innerHTML = pdfHtml(f, a.textContent ?? undefined);
      const block = a.closest('p') ?? a;
      block.replaceWith(holder.firstElementChild!);
    } else {
      a.replaceWith(...Array.from(a.childNodes)); // links to other notes become text
    }
  });

  doc.querySelectorAll('ul').forEach((ul) => {
    const items = Array.from(ul.children).filter((li) => li.tagName === 'LI');
    if (!items.length || !items.every((li) => li.querySelector(':scope > input[type=checkbox], :scope > p > input[type=checkbox]'))) return;
    ul.setAttribute('data-type', 'taskList');
    items.forEach((li) => {
      const box = li.querySelector('input[type=checkbox]') as HTMLInputElement;
      li.setAttribute('data-type', 'taskItem');
      li.setAttribute('data-checked', String(box.checked || box.hasAttribute('checked')));
      box.remove();
    });
  });

  doc.querySelectorAll('blockquote').forEach((q) => {
    const first = q.querySelector('p');
    const m = first && /^\s*\[!(\w+)\][+-]?\s*/.exec(first.innerHTML);
    if (!m || !first) return;
    first.innerHTML = first.innerHTML.slice(m[0].length);
    if (!first.textContent?.trim()) first.remove();
    const callout = doc.createElement('div');
    callout.setAttribute('data-callout', '');
    callout.append(...Array.from(q.childNodes));
    q.replaceWith(callout);
  });

  return doc.body.innerHTML;
}

/** Plain text of a document, one line per block (like the editor's getText). */
function docText(node: JSONContent): string {
  if (node.type === 'text') return node.text ?? '';
  if (node.type === 'hardBreak') return '\n';
  const inner = (node.content ?? []).map(docText);
  const isTextblock = (node.content ?? []).some((c) => c.type === 'text' || c.type === 'hardBreak');
  return isTextblock ? inner.join('') : inner.filter(Boolean).join('\n');
}

function toDoc(html: string): { content: JSONContent; text: string } {
  const content = generateJSON(html || '<p></p>', schemaExtensions()) as JSONContent;
  return { content, text: docText(content) };
}

const JOURNAL_FOLDER = /daily|journal|journ|diary|يوميات|مذكرات/i;

export function noteFromFile(file: ImportFile, root: string, lookup: Lookup): ImportNote | null {
  const raw = file.text ?? '';
  const name = basename(file.path);
  const dirParts = file.path.split('/').slice(0, -1);
  const relDir = root && dirParts[0] === root ? dirParts.slice(1) : dirParts;
  const ext = name.split('.').pop()?.toLowerCase();

  let meta: FrontMatter = {};
  let html: string;
  if (ext === 'html' || ext === 'htm') {
    const doc = new DOMParser().parseFromString(raw, 'text/html');
    const h1 = doc.querySelector('h1');
    if (h1) {
      meta.title = h1.textContent?.trim();
      h1.remove();
    }
    doc.querySelectorAll('script, style, header table.properties').forEach((n) => n.remove());
    html = doc.body.innerHTML;
  } else {
    const parsed = parseFrontMatter(raw);
    meta = parsed.meta;
    let body = parsed.body;
    // Notion and many exports repeat the title as the first heading.
    const h1 = /^\s*#\s+(.+)\r?\n/.exec(body);
    if (h1 && (!meta.title || cleanTitle(h1[1]) === meta.title || h1[1].trim() === cleanTitle(name))) {
      meta.title ??= h1[1].trim();
      body = body.slice(h1[0].length);
    }
    const md = ext === 'txt' ? body.replace(/[<&]/g, (c) => (c === '<' ? '&lt;' : '&amp;')) : obsidianToMarkdown(body, lookup);
    html = ext === 'txt' ? md.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('') : (marked.parse(md, { gfm: true, async: false }) as string);
  }

  html = postProcess(html, dirParts.join('/'), lookup);
  const { content, text } = toDoc(html);
  const fileDate = /(\d{4}-\d{2}-\d{2})/.exec(name)?.[1];
  const folder = meta.folder ?? (relDir.length ? relDir.map(cleanTitle).join(' / ') : null);
  const date = meta.date ?? fileDate ?? null;
  const journal = meta.journal ?? (!!date && (JOURNAL_FOLDER.test(folder ?? '') || /^\d{4}-\d{2}-\d{2}$/.test(stripExt(name))));

  return {
    title: (meta.title ?? cleanTitle(name)).slice(0, 500),
    content,
    text,
    folder,
    date,
    journal,
    pinned: meta.pinned ?? false,
    createdAt: meta.created ?? null,
    updatedAt: meta.updated ?? null,
  };
}

function folderOf(path: string, root: string): string | null {
  const dirParts = path.split('/').slice(0, -1);
  const relDir = root && dirParts[0] === root ? dirParts.slice(1) : dirParts;
  return relDir.length ? relDir.map(cleanTitle).join(' / ') : null;
}

/** A CSV/TSV or a workbook → one page per sheet (split when very large). */
export function notesFromSheet(file: ImportFile, root: string): ImportNote[] {
  const name = basename(file.path);
  // "Tasks <id>_all.csv" → "Tasks"
  const base = stripExt(name).replace(/_all$/, '').replace(/\s+[0-9a-f]{32}$/i, '').trim();
  const folder = folderOf(file.path, root);
  const sheets =
    file.kind === 'sheet'
      ? (file.sheets ?? []).map((s) => ({ title: (file.sheets?.length ?? 0) > 1 ? `${base} · ${s.name}` : base, rows: s.rows }))
      : [{ title: base, rows: parseCsv(file.text ?? '', /\.tsv$/i.test(name) ? '	' : undefined).map((r) => r.map(cleanNotionCell)) }];
  const out: ImportNote[] = [];
  for (const sheet of sheets) {
    const docs = sheetDocs(sheet.rows);
    docs.forEach((d, i) =>
      out.push({
        title: (docs.length > 1 ? `${sheet.title} (${i + 1}/${docs.length})` : sheet.title).slice(0, 500),
        content: d.content,
        text: d.text,
        folder,
        date: null,
        journal: false,
        pinned: false,
        createdAt: null,
        updatedAt: null,
      }),
    );
  }
  return out;
}

const SHEET = /\.(csv|tsv)$/i;

/**
 * Notion exports a database twice: "Name <id>.csv" (the current view) and
 * "Name <id>_all.csv" (every row). Keep the complete one.
 */
function dropNotionDuplicates(files: ImportFile[]): ImportFile[] {
  const all = new Set(files.filter((f) => /_all\.csv$/i.test(f.path)).map((f) => f.path.replace(/_all\.csv$/i, '.csv').toLowerCase()));
  return files.filter((f) => !all.has(f.path.toLowerCase()));
}

/** Gives the window a frame to repaint during long conversions. */
const breathe = () => new Promise<void>((r) => setTimeout(r, 0));

/** Points a document at its new attachments and pages. */
function remapIds(node: JSONContent, files: Map<string, string>, pages: Map<string, string>): JSONContent {
  let attrs = node.attrs;
  if (attrs?.attachmentId) attrs = { ...attrs, attachmentId: files.get(attrs.attachmentId) ?? attrs.attachmentId };
  if (attrs?.pageId) attrs = { ...attrs, pageId: pages.get(attrs.pageId) ?? attrs.pageId };
  return { ...node, attrs, content: node.content?.map((c) => remapIds(c, files, pages)) };
}

interface Backup {
  notes: ImportNote[];
  folders: Folder[];
}

export function fromBackup(json: string, files: ImportFile[]): Backup {
  const data = JSON.parse(json) as { format?: string; notes?: Note[]; folders?: Folder[] };
  if (data.format !== 'tadween' || !Array.isArray(data.notes)) throw new Error('not a Tadween backup');
  // Fresh ids, so a backup can be restored next to the notes it came from
  // and its sub-pages still find each other.
  const pages = new Map(data.notes.map((n) => [n.id, crypto.randomUUID()]));
  const ids = new Map<string, string>();
  for (const f of files) {
    const m = /^attachments\/([0-9a-f-]+)\.pdf$/i.exec(f.path);
    if (m && f.attachmentId) ids.set(m[1], f.attachmentId);
  }
  const folderName = (id: string | null) => data.folders?.find((f) => f.id === id)?.name ?? null;
  const notes = data.notes.map((n) => ({
    id: pages.get(n.id),
    parentId: n.parentId ? (pages.get(n.parentId) ?? null) : null,
    title: n.title,
    content: remapIds(n.content, ids, pages),
    text: n.text,
    folder: folderName(n.folderId),
    date: n.date ?? null,
    journal: !!n.journal,
    pinned: !!n.pinned,
    icon: n.icon ?? null,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  }));
  return { notes, folders: data.folders ?? [] };
}

/** Folders of a backup: the empty ones are created, the pinned ones pinned again. */
async function restoreFolders(saved: Folder[]) {
  const existing = await api.listFolders();
  for (const folder of saved) {
    const match = existing.find((f) => f.name === folder.name) ?? (await api.createFolder(folder.name));
    if (folder.pinned && !match.pinned) await api.pinFolder(match.id, true);
  }
}

export interface ImportResult {
  source: string;
  count: number;
  skipped: number;
}

/**
 * Lets the user pick a folder or zip files and imports every page found.
 * Returns null when the dialog was cancelled.
 */
export async function importFrom(mode: ImportMode, onProgress?: (done: number, total: number) => void): Promise<ImportResult | null> {
  const bundle = await api.importPick(mode);
  if (!bundle) return null;
  const files = bundle.files;

  const backup = files.find((f) => f.path.split('/').pop() === BACKUP_FILE && f.text);
  let notes: ImportNote[] = [];
  let folders: Folder[] = [];
  let skipped = 0;

  if (backup?.text) {
    ({ notes, folders } = fromBackup(backup.text, files));
  } else {
    const lookup: Lookup = { byPath: new Map(), byName: new Map() };
    for (const f of files) {
      if (f.kind === 'text') continue;
      lookup.byPath.set(f.path.toLowerCase(), f);
      lookup.byName.set(basename(f.path).toLowerCase(), f);
    }
    const docs = dropNotionDuplicates(files.filter((f) => f.kind === 'sheet' || (f.kind === 'text' && (/\.(md|markdown|txt|html?)$/i.test(f.path) || SHEET.test(f.path)))));
    // A zip with a single top folder: that folder is the source, not a folder of notes.
    const tops = new Set(docs.map((f) => f.path.split('/')[0]));
    const root = tops.size === 1 && docs.every((f) => f.path.includes('/')) ? [...tops][0] : '';
    for (let i = 0; i < docs.length; i++) {
      const f = docs[i];
      try {
        if (f.kind === 'sheet' || SHEET.test(f.path)) notes.push(...notesFromSheet(f, root));
        else {
          const n = noteFromFile(f, root, lookup);
          if (n) notes.push(n);
        }
      } catch {
        skipped += 1;
      }
      if (i % 10 === 0) {
        onProgress?.(i, docs.length);
        await breathe();
      }
    }
  }

  let count = 0;
  for (let i = 0; i < notes.length; i += 50) {
    count += await api.importNotes(notes.slice(i, i + 50));
    onProgress?.(Math.min(notes.length, i + 50), notes.length);
  }
  await restoreFolders(folders);
  return { source: bundle.source, count, skipped };
}
