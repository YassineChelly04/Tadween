import { create } from 'zustand';
import { api, type Folder, type NewNote, type NotePatch, type NoteSummary, type Prefs, type UnlockReport } from './lib/api';
import { flushAll } from './lib/saveQueue';
import { applyLanguage } from './i18n';

/** `signup` is onboarding opened from the login screen to add an account. */
export type Phase = 'boot' | 'onboarding' | 'signup' | 'locked' | 'unlocked';
type View =
  | { kind: 'home' }
  | { kind: 'pages'; folder?: string }
  | { kind: 'calendar' }
  | { kind: 'page'; id: string }
  | { kind: 'trash' };

export type SettingsTab = 'general' | 'security' | 'transfer' | 'about';
export type TourId = 'home' | 'settings' | 'page';

interface AppState {
  phase: Phase;
  prefs: Prefs;
  username: string;
  /** What the app calls the user; falls back to the username. */
  displayName: string;
  lockReason: 'idle' | null;
  unreadable: number;

  notes: NoteSummary[];
  folders: Folder[];
  view: View;
  sidebarOpen: boolean;
  findOpen: boolean;
  settingsTab: SettingsTab | null;
  /** The first-run tour on screen, if any. */
  tour: TourId | null;
  /** Tours this account has already seen (kept in the vault settings). */
  toursSeen: string[];

  boot: () => Promise<void>;
  setPrefs: (patch: Partial<Prefs>) => Promise<void>;
  enterVault: (report?: UnlockReport) => Promise<void>;
  startSignup: () => void;
  setDisplayName: (name: string) => Promise<void>;
  cancelSignup: () => void;
  lock: (reason?: 'idle') => Promise<void>;
  /** Erases this account for good. Throws on a wrong password. */
  deleteAccount: (password: string) => Promise<void>;
  markLocked: (reason: 'idle' | null) => void;

  refresh: () => Promise<void>;
  open: (view: View) => void;
  createNote: (opts?: NewNote) => Promise<string>;
  /** Creates a page inside `parentId` without leaving the page on screen. */
  createSubPage: (parentId: string) => Promise<string>;
  upsertSummary: (s: NoteSummary) => void;
  patchNote: (id: string, patch: NotePatch) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  moveNote: (id: string, folderId: string | null) => Promise<void>;
  /** Puts a page inside another one, or back at the top level with `null`. */
  nestNote: (id: string, parentId: string | null) => Promise<void>;
  duplicate: (id: string) => Promise<void>;
  trash: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  deleteForever: (id: string) => Promise<void>;
  emptyTrash: () => Promise<void>;

  createFolder: (name: string) => Promise<Folder>;
  renameFolder: (id: string, name: string) => Promise<void>;
  /** Pinned folders are the ones the sidebar lists. */
  pinFolder: (id: string, pinned: boolean) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;

  setSidebar: (open: boolean) => void;
  setFind: (open: boolean) => void;
  openSettings: (tab: SettingsTab | null) => void;
  /** Starts a tour unless it was already seen or another one is running. */
  startTour: (id: TourId) => void;
  endTour: () => void;
}

function applyTheme(theme: Prefs['theme']) {
  document.documentElement.dataset.theme = theme;
}

/** Creates a page and lists it, without opening it. */
async function addNote(opts: NewNote): Promise<string> {
  const note = await api.createNote(opts);
  const summary: NoteSummary = {
    id: note.id,
    title: note.title,
    preview: '',
    folderId: note.folderId,
    parentId: note.parentId,
    pinned: false,
    date: note.date,
    journal: note.journal,
    icon: null,
    trashedAt: null,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    words: 0,
  };
  useApp.setState((s) => ({ notes: [summary, ...s.notes] }));
  return note.id;
}

export const useApp = create<AppState>((set, get) => ({
  phase: 'boot',
  prefs: { language: 'en', theme: 'system', lastUsername: null, loginBackdrop: 'mark' },
  username: '',
  displayName: '',
  lockReason: null,
  unreadable: 0,
  notes: [],
  folders: [],
  view: { kind: 'home' },
  sidebarOpen: true,
  findOpen: false,
  settingsTab: null,
  tour: null,
  toursSeen: [],

  async boot() {
    const status = await api.status();
    applyLanguage(status.prefs.language);
    applyTheme(status.prefs.theme);
    set({ prefs: status.prefs, username: status.username ?? '', displayName: status.displayName ?? '' });
    if (status.accounts === 0) set({ phase: 'onboarding' });
    else if (status.unlocked) await get().enterVault();
    else set({ phase: 'locked' });
  },

  async setPrefs(patch) {
    const prefs = { ...get().prefs, ...patch };
    applyLanguage(prefs.language);
    applyTheme(prefs.theme);
    set({ prefs });
    await api.setPrefs(prefs);
  },

  async enterVault(report) {
    const [notes, folders, status, settings] = await Promise.all([
      api.listNotes(),
      api.listFolders(),
      api.status(),
      api.getSettings(),
    ]);
    set({
      notes,
      folders,
      phase: 'unlocked',
      username: report?.username ?? status.username ?? '',
      displayName: report?.displayName ?? status.displayName ?? '',
      prefs: { ...get().prefs, lastUsername: status.prefs.lastUsername },
      lockReason: null,
      unreadable: report?.unreadableNotes ?? 0,
      view: { kind: 'home' },
      toursSeen: settings.toursSeen ?? [],
    });
  },

  startSignup: () => set({ phase: 'signup' }),

  async setDisplayName(name) {
    const saved = await api.setDisplayName(name);
    set({ displayName: saved });
  },
  cancelSignup: () => set({ phase: 'locked' }),

  async lock(reason) {
    await flushAll().catch(() => undefined);
    await api.lock();
    get().markLocked(reason ?? null);
  },

  async deleteAccount(password) {
    await api.deleteAccount(password);
    const status = await api.status();
    get().markLocked(null);
    set({ prefs: { ...get().prefs, lastUsername: status.prefs.lastUsername }, phase: status.accounts === 0 ? 'onboarding' : 'locked' });
  },

  markLocked(reason) {
    set({
      phase: 'locked',
      lockReason: reason,
      username: '',
      displayName: '',
      notes: [],
      folders: [],
      view: { kind: 'home' },
      findOpen: false,
      settingsTab: null,
      tour: null,
      toursSeen: [],
    });
  },

  async refresh() {
    const [notes, folders] = await Promise.all([api.listNotes(), api.listFolders()]);
    set({ notes, folders });
  },

  open(view) {
    set({ view, findOpen: false });
  },

  async createNote(opts = {}) {
    await flushAll();
    const id = await addNote(opts);
    get().open({ kind: 'page', id });
    return id;
  },

  createSubPage: (parentId) => addNote({ parentId }),

  upsertSummary(s) {
    const notes = get().notes;
    const i = notes.findIndex((n) => n.id === s.id);
    set({ notes: i < 0 ? [s, ...notes] : notes.map((n) => (n.id === s.id ? s : n)) });
  },

  async patchNote(id, patch) {
    get().upsertSummary(await api.updateNote(id, patch));
  },

  async togglePin(id) {
    const note = get().notes.find((n) => n.id === id);
    if (note) await get().patchNote(id, { pinned: !note.pinned });
  },

  async moveNote(id, folderId) {
    // A folder is a place of its own: the page comes out of any page it was in.
    const nested = !!get().notes.find((n) => n.id === id)?.parentId;
    await api.updateNote(id, { folderId, ...(nested ? { parentId: null } : {}) });
    await get().refresh();
  },

  async nestNote(id, parentId) {
    await flushAll();
    await api.updateNote(id, { parentId });
    await get().refresh();
  },

  async duplicate(id) {
    await flushAll();
    await api.duplicateNote(id);
    await get().refresh();
  },

  // Sub-pages move with their page, so these reload the list.
  async trash(id) {
    await flushAll();
    await api.trashNote(id);
    await get().refresh();
    const { view, notes } = get();
    if (view.kind === 'page' && notes.find((n) => n.id === view.id)?.trashedAt) get().open({ kind: 'home' });
  },

  async restore(id) {
    await api.restoreNote(id);
    await get().refresh();
  },

  async deleteForever(id) {
    await api.deleteNote(id);
    await get().refresh();
    const { view, notes } = get();
    if (view.kind === 'page' && !notes.some((n) => n.id === view.id)) get().open({ kind: 'trash' });
  },

  async emptyTrash() {
    await api.emptyTrash();
    await get().refresh();
  },

  async createFolder(name) {
    const folder = await api.createFolder(name);
    set({ folders: [...get().folders, folder] });
    return folder;
  },

  async renameFolder(id, name) {
    const folder = await api.renameFolder(id, name);
    set({ folders: get().folders.map((f) => (f.id === id ? folder : f)) });
  },

  async pinFolder(id, pinned) {
    const folder = await api.pinFolder(id, pinned);
    set({ folders: get().folders.map((f) => (f.id === id ? folder : f)) });
  },

  async deleteFolder(id) {
    await api.deleteFolder(id);
    set({
      folders: get().folders.filter((f) => f.id !== id),
      notes: get().notes.map((n) => (n.folderId === id ? { ...n, folderId: null } : n)),
    });
  },

  setSidebar: (sidebarOpen) => set({ sidebarOpen }),
  setFind: (findOpen) => set({ findOpen }),
  openSettings: (settingsTab) => set({ settingsTab }),
  startTour(id) {
    const { tour, toursSeen } = get();
    if (tour || toursSeen.includes(id)) return;
    set({ tour: id, findOpen: false });
  },

  endTour() {
    const { tour, toursSeen } = get();
    if (!tour) return;
    const seen = toursSeen.includes(tour) ? toursSeen : [...toursSeen, tour];
    set({ tour: null, toursSeen: seen });
    void api.setSettings({ toursSeen: seen }).catch(() => undefined);
  },
}));
