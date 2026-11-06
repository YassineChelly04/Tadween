// Typed bridge to the Rust core. Inside Tauri every call goes through `invoke`;
// in a plain browser (UI development only) it falls back to an in-memory mock,
// which the release build does not contain.

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { JSONContent } from '@tiptap/core';

export type Language = 'en' | 'fr' | 'ar';
/** `system` follows Windows between light and dark. */
export type Theme = 'day' | 'light' | 'dark' | 'system';

export interface Prefs {
  language: Language;
  theme: Theme;
  lastUsername?: string | null;
  /** The drawing behind the cast on the login screen. */
  loginBackdrop?: string;
}

export interface Status {
  /** Accounts on this computer (an older single vault counts as one). */
  accounts: number;
  unlocked: boolean;
  username: string | null;
  displayName: string | null;
  prefs: Prefs;
}

export interface NoteSummary {
  id: string;
  title: string;
  preview: string;
  folderId: string | null;
  /** The page this one lives inside, if any. */
  parentId: string | null;
  pinned: boolean;
  /** Date property, YYYY-MM-DD. */
  date: string | null;
  journal: boolean;
  /** `name:colour` from the app's icon set, e.g. `leaf:ember`. */
  icon: string | null;
  trashedAt: number | null;
  createdAt: number;
  updatedAt: number;
  words: number;
}

export interface Note {
  id: string;
  title: string;
  content: JSONContent;
  text: string;
  folderId: string | null;
  parentId: string | null;
  pinned: boolean;
  date: string | null;
  journal: boolean;
  icon: string | null;
  trashedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface NewNote {
  folderId?: string | null;
  date?: string | null;
  journal?: boolean;
  title?: string | null;
  /** Makes the new page a sub-page of this one. */
  parentId?: string | null;
}

export interface NotePatch {
  title?: string;
  content?: JSONContent;
  text?: string;
  folderId?: string | null;
  parentId?: string | null;
  pinned?: boolean;
  date?: string | null;
  journal?: boolean;
  icon?: string | null;
}

export interface ImportNote {
  /** A backup brings its own ids, so sub-pages and links to them survive. */
  id?: string;
  parentId?: string | null;
  title: string;
  content: JSONContent;
  text: string;
  folder: string | null;
  date: string | null;
  journal: boolean;
  pinned: boolean;
  icon?: string | null;
  createdAt: number | null;
  updatedAt: number | null;
}

export interface ImportFile {
  path: string;
  kind: 'text' | 'image' | 'pdf' | 'sheet';
  text: string | null;
  dataUrl: string | null;
  attachmentId: string | null;
  /** Workbooks: every sheet as rows of cell text. */
  sheets: { name: string; rows: string[][] }[] | null;
  size: number;
}

export type ImportMode = 'folder' | 'zip' | 'files';

export interface ExportEntry {
  path: string;
  text?: string;
  base64?: string;
  attachmentId?: string;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  /** Pinned folders are the ones listed in the sidebar. */
  pinned: boolean;
}

export interface SearchHit {
  id: string;
  title: string;
  snippet: string;
  folderId: string | null;
  updatedAt: number;
}

export interface VaultSettings {
  autoLockMinutes: number;
  /** First-run tours already shown. */
  toursSeen: string[];
  /** The language dictation listens for; follows the interface until chosen. */
  dictationLanguage: Language | null;
}

export interface UnlockReport {
  unreadableNotes: number;
  username: string;
  displayName: string;
}

export type ErrorCode =
  | 'no_vault'
  | 'vault_exists'
  | 'locked'
  | 'wrong_password'
  | 'wrong_recovery_key'
  | 'throttled'
  | 'weak_password'
  | 'not_found'
  | 'invalid'
  | 'decrypt'
  | 'corrupted'
  | 'crypto'
  | 'io'
  | 'json'
  | 'microphone'
  | 'speech_model';

/** Everything a running dictation reports; see `src-tauri/src/dictation.rs`. */
export type DictationEvent =
  | { kind: 'listening'; session: number }
  | { kind: 'partial'; session: number; text: string }
  | { kind: 'final'; session: number; text: string }
  | { kind: 'level'; session: number; value: number }
  | { kind: 'stopped'; session: number }
  | { kind: 'error'; session: number; message: string };

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public retryAfterMs: number | null = null,
  ) {
    super(message);
  }
}

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function mock() {
  if (import.meta.env.PROD) throw new Error('Tadween needs its desktop core.');
  return import('./mock');
}

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return isTauri ? await invoke<T>(cmd, args) : await (await mock()).mockInvoke<T>(cmd, args);
  } catch (e) {
    if (e && typeof e === 'object' && 'code' in e) {
      const err = e as { code: ErrorCode; message: string; retryAfterMs?: number | null };
      throw new ApiError(err.code, err.message, err.retryAfterMs ?? null);
    }
    throw new ApiError('io', String(e));
  }
}

export const api = {
  status: () => call<Status>('status'),
  setPrefs: (prefs: Prefs) => call<Prefs>('prefs_set', { prefs }),

  createVault: (username: string, password: string) =>
    call<{ recoveryKey: string }>('vault_create', { username, password }),
  unlock: (username: string, password: string) => call<UnlockReport>('vault_unlock', { username, password }),
  recover: (username: string, recoveryKey: string, newPassword: string) =>
    call<UnlockReport>('vault_recover', { username, recoveryKey, newPassword }),
  changePassword: (current: string, next: string) => call<void>('vault_change_password', { current, next }),
  newRecoveryKey: (password: string) => call<{ recoveryKey: string }>('vault_new_recovery_key', { password }),
  /** Erases the open account and everything in it, after checking the password. */
  deleteAccount: (password: string) => call<void>('account_delete', { password }),
  lock: () => call<void>('vault_lock'),
  activity: () => call<void>('activity'),
  setDisplayName: (displayName: string) => call<string>('profile_set', { displayName }),

  getSettings: () => call<VaultSettings>('settings_get'),
  /** Partial update: fields left out keep their value. */
  setSettings: (settings: Partial<VaultSettings>) => call<VaultSettings>('settings_set', { settings }),

  listNotes: () => call<NoteSummary[]>('notes_list'),
  getNote: (id: string) => call<Note>('note_get', { id }),
  createNote: (note: NewNote) => call<Note>('note_create', { note }),
  updateNote: (id: string, patch: NotePatch) => call<NoteSummary>('note_update', { id, patch }),
  duplicateNote: (id: string) => call<Note>('note_duplicate', { id }),
  trashNote: (id: string) => call<NoteSummary>('note_trash', { id }),
  restoreNote: (id: string) => call<NoteSummary>('note_restore', { id }),
  deleteNote: (id: string) => call<void>('note_delete', { id }),
  emptyTrash: () => call<number>('trash_empty'),
  search: (query: string) => call<SearchHit[]>('search', { query }),
  exportAll: () => call<{ notes: Note[]; folders: Folder[] }>('notes_export'),
  importNotes: (notes: ImportNote[]) => call<number>('notes_import', { notes }),

  /** Stores PDF bytes as an encrypted attachment; sent as the raw request body. */
  addAttachment: async (bytes: Uint8Array): Promise<string> => {
    if (!isTauri) return (await mock()).mockInvoke<string>('attachment_add', { bytes });
    try {
      return await invoke<string>('attachment_add', bytes);
    } catch (e) {
      const err = e as { code?: ErrorCode; message?: string };
      throw new ApiError(err?.code ?? 'io', err?.message ?? String(e));
    }
  },
  readAttachment: (id: string) => call<ArrayBuffer>('attachment_read', { id }),
  importPick: (mode: ImportMode) => call<{ source: string; files: ImportFile[] } | null>('import_pick', { mode }),
  /** `missing` counts attachments that could not be read and were left out. */
  exportSave: (fileName: string, entries: ExportEntry[]) =>
    call<{ path: string; missing: number } | null>('export_save', { fileName, entries }),
  /** Opens a web or mail link in the default browser. */
  openLink: (url: string) => call<void>('open_link', { url }),

  listFolders: () => call<Folder[]>('folders_list'),
  createFolder: (name: string) => call<Folder>('folder_create', { name }),
  renameFolder: (id: string, name: string) => call<Folder>('folder_rename', { id, name }),
  pinFolder: (id: string, pinned: boolean) => call<Folder>('folder_pin', { id, pinned }),
  deleteFolder: (id: string) => call<void>('folder_delete', { id }),

  /** Opens the microphone; returns the session id. Results come through `onDictation`. */
  dictationStart: (language: Language) => call<number>('dictation_start', { language }),
  /** Closes the microphone; the last phrase still arrives, then `stopped`. */
  dictationStop: () => call<void>('dictation_stop'),
  /** Loads the speech model ahead of time. */
  dictationPrepare: (language: Language) => call<void>('dictation_prepare', { language }),
};

/** Subscribes to dictation events. Returns an unsubscribe function. */
export async function onDictation(handler: (event: DictationEvent) => void): Promise<() => void> {
  if (!isTauri) return (await mock()).mockListen('dictation', handler as (payload?: unknown) => void);
  return listen<DictationEvent>('dictation', (e) => handler(e.payload));
}

/** Subscribes to the vault locking itself (idle timeout). Returns an unsubscribe function. */
export async function onLocked(handler: () => void): Promise<() => void> {
  if (!isTauri) return (await mock()).mockListen('vault-locked', handler);
  return listen('vault-locked', () => handler());
}
