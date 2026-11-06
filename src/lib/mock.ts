// Browser-only stand-in for the Rust core, used when the UI runs outside Tauri
// (`npm run dev` in a normal browser). It keeps data in memory, does NO
// encryption, and is never used inside the desktop app.

import type { Folder, ImportNote, NewNote, Note, NotePatch, NoteSummary, Prefs, SearchHit, VaultSettings } from './api';
import { fold } from './fold';
import { checkPassword } from './password';

interface Account {
  username: string;
  displayName: string;
  password: string;
  recoveryKey: string;
  settings: VaultSettings;
  folders: Folder[];
  notes: Record<string, Note>;
}

const accounts = new Map<string, Account>();
let prefs: Prefs = { language: 'en', theme: 'system', lastUsername: null, loginBackdrop: 'mark' };
let current: Account | null = null;
const listeners = new Map<string, Set<(payload?: unknown) => void>>();

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = () => crypto.randomUUID();
const fail = (code: string, message: string) => Promise.reject({ code, message, retryAfterMs: null });
const key = (u: string) => u.trim().replace(/\s+/g, ' ').toLowerCase();

function summary(n: Note): NoteSummary {
  const preview = n.text.replace(/\s+/g, ' ').trim();
  return {
    id: n.id,
    title: n.title,
    preview: preview.length > 160 ? preview.slice(0, 160) + '…' : preview,
    folderId: n.folderId,
    parentId: n.parentId ?? null,
    pinned: n.pinned,
    date: n.date,
    journal: n.journal,
    icon: n.icon ?? null,
    trashedAt: n.trashedAt,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    words: n.text.split(/\s+/).filter(Boolean).length,
  };
}

function me(): Account {
  if (!current) throw { code: 'locked', message: 'The vault is locked', retryAfterMs: null };
  return current;
}

function getNote(id: string): Note {
  const n = me().notes[id];
  if (!n) throw { code: 'not_found', message: 'Not found', retryAfterMs: null };
  return n;
}

function folderFor(name: string | null): string | null {
  if (!name) return null;
  const a = me();
  let f = a.folders.find((x) => x.name === name);
  if (!f) {
    f = { id: uid(), name, createdAt: Date.now(), pinned: false };
    a.folders.push(f);
  }
  return f.id;
}

export async function mockInvoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  await delay(cmd.startsWith('vault_') ? 450 : 10);
  const a = args as Record<string, any>;
  switch (cmd) {
    case 'status':
      return {
        accounts: accounts.size,
        unlocked: !!current,
        username: current?.username ?? null,
        displayName: current?.displayName ?? null,
        prefs,
      } as T;
    case 'prefs_set':
      prefs = a.prefs;
      return prefs as T;
    case 'vault_create': {
      if (accounts.has(key(a.username))) return fail('vault_exists', 'Username taken');
      if (!checkPassword(a.password).ok) return fail('weak_password', 'Password is too weak');
      current = {
        username: a.username.trim(),
        displayName: '',
        password: a.password,
        recoveryKey: 'K7QM-2VXD-9TNB-H4PR-W8CF-3JZA',
        settings: { autoLockMinutes: 10, toursSeen: [], dictationLanguage: null },
        folders: [],
        notes: {},
      };
      accounts.set(key(a.username), current);
      prefs = { ...prefs, lastUsername: current.username };
      return { recoveryKey: current.recoveryKey } as T;
    }
    case 'vault_unlock': {
      const acc = accounts.get(key(a.username));
      if (!acc || acc.password !== a.password) return fail('wrong_password', 'Wrong password');
      current = acc;
      prefs = { ...prefs, lastUsername: acc.username };
      return { unreadableNotes: 0, username: acc.username, displayName: acc.displayName } as T;
    }
    case 'vault_recover': {
      const acc = accounts.get(key(a.username));
      const typed = String(a.recoveryKey).toUpperCase().replace(/[^0-9A-Z]/g, '');
      if (!acc || typed !== acc.recoveryKey.replace(/-/g, '')) return fail('wrong_recovery_key', 'Wrong recovery key');
      if (!checkPassword(a.newPassword).ok) return fail('weak_password', 'Password is too weak');
      acc.password = a.newPassword;
      current = acc;
      return { unreadableNotes: 0, username: acc.username, displayName: acc.displayName } as T;
    }
    case 'vault_change_password':
      if (a.current !== me().password) return fail('wrong_password', 'Wrong password');
      if (!checkPassword(a.next).ok) return fail('weak_password', 'Password is too weak');
      me().password = a.next;
      return undefined as T;
    case 'vault_new_recovery_key':
      if (a.password !== me().password) return fail('wrong_password', 'Wrong password');
      me().recoveryKey = 'P3XW-7HKD-QM2V-9RTN-B6FJ-4CZE';
      return { recoveryKey: me().recoveryKey } as T;
    case 'vault_lock':
      current = null;
      return undefined as T;
    case 'account_delete': {
      if (a.password !== me().password) return fail('wrong_password', 'Wrong password');
      accounts.delete(key(me().username));
      prefs = { ...prefs, lastUsername: null };
      current = null;
      return undefined as T;
    }
    case 'open_link':
      window.open(String(a.url), '_blank', 'noopener');
      return undefined as T;
    case 'activity':
      return undefined as T;
    case 'profile_set':
      me().displayName = String(a.displayName).trim().replace(/\s+/g, ' ');
      return me().displayName as T;
  }

  const acc = me();
  switch (cmd) {
    case 'settings_get':
      return acc.settings as T;
    case 'settings_set':
      acc.settings = { ...acc.settings, ...a.settings };
      return acc.settings as T;
    case 'notes_list':
      return Object.values(acc.notes)
        .map(summary)
        .sort((x, y) => y.updatedAt - x.updatedAt) as T;
    case 'notes_export':
      return { notes: structuredClone(Object.values(acc.notes)), folders: [...acc.folders] } as T;
    case 'notes_import': {
      const batch = a.notes as ImportNote[];
      for (const item of batch) {
        const now = Date.now();
        const n: Note = {
          id: item.id ?? uid(),
          title: item.title,
          content: item.content,
          text: item.text,
          folderId: folderFor(item.folder),
          parentId: item.parentId ?? null,
          pinned: item.pinned,
          date: item.date,
          journal: item.journal,
          icon: item.icon ?? null,
          trashedAt: null,
          createdAt: item.createdAt ?? now,
          updatedAt: item.updatedAt ?? item.createdAt ?? now,
        };
        acc.notes[n.id] = n;
      }
      return batch.length as T;
    }
    case 'note_get':
      return structuredClone(getNote(a.id)) as T;
    case 'note_create': {
      const now = Date.now();
      const asked = a.note as NewNote;
      const parent = asked.parentId ? getNote(asked.parentId) : null;
      const note: Note = {
        id: uid(),
        title: asked.title ?? '',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        text: '',
        folderId: parent ? parent.folderId : (asked.folderId ?? null),
        parentId: asked.parentId ?? null,
        pinned: false,
        date: asked.date ?? null,
        journal: !!asked.journal,
        icon: null,
        trashedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      acc.notes[note.id] = note;
      return structuredClone(note) as T;
    }
    case 'note_update': {
      const n = getNote(a.id);
      const p = a.patch as NotePatch;
      if (p.title !== undefined || p.content !== undefined) n.updatedAt = Date.now();
      if (p.title !== undefined) n.title = p.title;
      if (p.content !== undefined) n.content = p.content;
      if (p.text !== undefined) n.text = p.text;
      if (p.folderId !== undefined) n.folderId = p.folderId;
      if (p.parentId !== undefined) n.parentId = p.parentId;
      if (p.pinned !== undefined) n.pinned = p.pinned;
      if (p.date !== undefined) n.date = p.date;
      if (p.journal !== undefined) n.journal = p.journal;
      if (p.icon !== undefined) n.icon = p.icon;
      return summary(n) as T;
    }
    case 'note_duplicate': {
      const src = getNote(a.id);
      const now = Date.now();
      const copy: Note = { ...structuredClone(src), id: uid(), pinned: false, journal: false, trashedAt: null, createdAt: now, updatedAt: now };
      acc.notes[copy.id] = copy;
      return structuredClone(copy) as T;
    }
    case 'note_trash':
    case 'note_restore': {
      const n = getNote(a.id);
      const family = Object.values(acc.notes).filter((x) => x.parentId === a.id);
      for (const x of [n, ...family]) {
        x.trashedAt = cmd === 'note_trash' ? Date.now() : null;
        if (x.trashedAt) x.pinned = false;
        if (x.folderId && !acc.folders.some((f) => f.id === x.folderId)) x.folderId = null;
      }
      return summary(n) as T;
    }
    case 'note_delete':
      getNote(a.id);
      delete acc.notes[a.id];
      return undefined as T;
    case 'trash_empty': {
      const ids = Object.values(acc.notes).filter((n) => n.trashedAt).map((n) => n.id);
      ids.forEach((id) => delete acc.notes[id]);
      return ids.length as T;
    }
    case 'search': {
      const q = fold(String(a.query).trim());
      if (!q) return [] as T;
      const hits: (SearchHit & { rank: number })[] = [];
      for (const n of Object.values(acc.notes)) {
        if (n.trashedAt) continue;
        const inTitle = fold(n.title).includes(q);
        const at = fold(n.text).indexOf(q);
        if (!inTitle && at < 0) continue;
        const start = Math.max(0, at - 48);
        const snippet = at >= 0 ? (start > 0 ? '…' : '') + n.text.slice(start, at + q.length + 48) : n.text.slice(0, 96);
        hits.push({ id: n.id, title: n.title, snippet, folderId: n.folderId, updatedAt: n.updatedAt, rank: inTitle ? 0 : 1 });
      }
      return hits.sort((x, y) => x.rank - y.rank || y.updatedAt - x.updatedAt) as T;
    }
    case 'folders_list':
      return [...acc.folders] as T;
    case 'folder_create': {
      const name = String(a.name).trim();
      if (!name) return fail('invalid', 'Invalid input: name');
      const f = { id: uid(), name, createdAt: Date.now(), pinned: false };
      acc.folders.push(f);
      return f as T;
    }
    case 'folder_rename': {
      const f = acc.folders.find((x) => x.id === a.id);
      if (!f) return fail('not_found', 'Not found');
      f.name = String(a.name).trim() || f.name;
      return f as T;
    }
    case 'folder_pin': {
      const f = acc.folders.find((x) => x.id === a.id);
      if (!f) return fail('not_found', 'Not found');
      f.pinned = !!a.pinned;
      return f as T;
    }
    case 'attachment_add':
      return crypto.randomUUID() as T;
    case 'folder_delete':
      acc.folders = acc.folders.filter((f) => f.id !== a.id);
      Object.values(acc.notes).forEach((n) => {
        if (n.folderId === a.id) n.folderId = null;
      });
      return undefined as T;
    case 'attachment_read':
      return new ArrayBuffer(0) as T;
    case 'import_pick':
    case 'export_save':
      return null as T;
    case 'dictation_prepare':
      await delay(300);
      return undefined as T;
    case 'dictation_start':
      await delay(300);
      return mockDictationStart(String(a.language)) as T;
    case 'dictation_stop':
      mockDictationStop();
      return undefined as T;
  }
  return fail('invalid', `Unknown command ${cmd}`);
}

// Dictation stand-in: speaks two phrases, word by word, with a voice level.
const SCRIPTS: Record<string, string[]> = {
  ar: ['ومن بين أكثر الطرق شيوعا التي تستخدم لتوضيح أهمية التنشئة الاجتماعية،', 'سيسمح ذلك للاعبين بالتحكم في الأفعال والحركات.'],
  fr: ['Les voyageurs peuvent parfois faire des économies considérables,', 'en particulier sur certains produits.'],
  en: ['Travellers can sometimes save a great deal of money,', 'especially on certain goods.'],
};
let dictation: { session: number; timer: number } | null = null;
let sessions = 0;
const emit = (event: string, payload: unknown) => listeners.get(event)?.forEach((h) => h(payload));

function mockDictationStart(language: string): number {
  if (dictation) return dictation.session;
  const session = ++sessions;
  const SCRIPT = SCRIPTS[language] ?? SCRIPTS.en;
  let tick = 0;
  const words = SCRIPT.map((p) => p.split(' '));
  emit('dictation', { kind: 'listening', session });
  const timer = window.setInterval(() => {
    tick += 1;
    const phrase = Math.floor(tick / 40) % SCRIPT.length;
    const step = tick % 40;
    const speaking = step < 30;
    emit('dictation', { kind: 'level', session, value: speaking ? 0.3 + Math.random() * 0.6 : Math.random() * 0.06 });
    if (speaking && step % 4 === 3) {
      const shown = Math.min(words[phrase].length, Math.ceil((step + 1) / 30 * words[phrase].length));
      emit('dictation', { kind: 'partial', session, text: words[phrase].slice(0, shown).join(' ') });
    }
    if (step === 36) emit('dictation', { kind: 'final', session, text: SCRIPT[phrase] });
  }, 50);
  dictation = { session, timer };
  return session;
}

function mockDictationStop() {
  if (!dictation) return;
  const { session, timer } = dictation;
  window.clearInterval(timer);
  dictation = null;
  window.setTimeout(() => emit('dictation', { kind: 'stopped', session }), 200);
}

export function mockListen(event: string, handler: (payload?: unknown) => void): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(handler);
  return () => listeners.get(event)?.delete(handler);
}
