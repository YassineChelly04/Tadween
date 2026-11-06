import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Check, Copy, FileText, Folder as FolderIcon, FolderInput, Pin, PinOff, Trash2, X } from 'lucide-react';
import { useApp } from '../../store';
import { useDismiss } from '../../lib/useDismiss';
import { isoDate, noteDay, parseIso, todayIso } from '../../lib/dates';
import { fold } from '../../lib/fold';
import { PAGE_MIME, draggedPages } from '../../lib/pages';
import type { NoteSummary } from '../../lib/api';
import { TopBar } from '../shell/TopBar';
import { PageIcon } from '../../components/icons/PageIcon';
import { Contents } from './Contents';

// Every page in the notebook: on a timeline grouped by when, or as sheets, with
// the folders down the margin. This is where pages are sorted, filed, pinned
// and moved in bulk; Home stays quiet because all of that lives here.

type Basis = 'edited' | 'date';
type Layout = 'timeline' | 'sheets';

function readPref<T extends string>(key: string, fallback: T, allowed: T[]): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered: fine */
  }
}

const pad = (n: number) => String(n).padStart(2, '0');

interface Group {
  key: string;
  label: string;
  items: NoteSummary[];
}

export function AllPages({ folder: initialFolder }: { folder?: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const notes = useApp((s) => s.notes);
  const folders = useApp((s) => s.folders);
  const open = useApp((s) => s.open);
  const createNote = useApp((s) => s.createNote);
  const moveNote = useApp((s) => s.moveNote);
  const patchNote = useApp((s) => s.patchNote);
  const trash = useApp((s) => s.trash);
  const duplicate = useApp((s) => s.duplicate);

  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState<string>(initialFolder ?? 'all');
  const [basis, setBasis] = useState<Basis>(() => readPref('tadween.home.basis', 'edited', ['edited', 'date']));
  const [layout, setLayout] = useState<Layout>(() => readPref('tadween.home.layout2', 'timeline', ['timeline', 'sheets']));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<{ x: number; y: number; ids: string[]; move?: boolean } | null>(null);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  useDismiss(menuRef, menu !== null, closeMenu);

  useEffect(() => setFolder(initialFolder ?? 'all'), [initialFolder]);
  useEffect(() => writePref('tadween.home.basis', basis), [basis]);
  useEffect(() => writePref('tadween.home.layout2', layout), [layout]);

  const live = useMemo(() => notes.filter((n) => !n.trashedAt), [notes]);
  const today = todayIso();

  const folderName = useCallback((id: string | null) => folders.find((f) => f.id === id)?.name, [folders]);
  // Where new pages go: the folder being looked at, if it is a real one.
  const targetFolder = useMemo(() => {
    if (folder.startsWith('tree:')) return folders.find((f) => f.name.trim() === folder.slice(5))?.id ?? null;
    return folder !== 'all' && folder !== 'none' ? folder : null;
  }, [folder, folders]);
  const filterLabel = folder.startsWith('tree:') ? folder.slice(5) : folders.find((f) => f.id === folder)?.name;

  const dayOf = useCallback((n: NoteSummary) => (basis === 'edited' ? isoDate(new Date(n.updatedAt)) : noteDay(n)), [basis]);

  const shown = useMemo(() => {
    const q = fold(query.trim());
    return live
      .filter((n) => {
        if (folder === 'none' && n.folderId) return false;
        if (folder.startsWith('tree:')) {
          const path = folder.slice(5);
          const name = folderName(n.folderId)?.trim();
          if (!name || (name !== path && !name.startsWith(`${path} / `))) return false;
        } else if (folder !== 'all' && folder !== 'none' && n.folderId !== folder) return false;
        return !q || fold(n.title).includes(q) || fold(n.preview).includes(q);
      })
      .sort((a, b) => dayOf(b).localeCompare(dayOf(a)) || b.updatedAt - a.updatedAt);
  }, [live, folder, query, dayOf, folderName]);

  // Today, yesterday, this week, then month by month.
  const groups = useMemo(() => {
    const out: Group[] = [];
    const yesterday = parseIso(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = parseIso(today);
    weekAgo.setDate(weekAgo.getDate() - 6);
    const y = isoDate(yesterday);
    const w = isoDate(weekAgo);
    const monthFmt = new Intl.DateTimeFormat(lang, { month: 'long', year: 'numeric' });
    for (const n of shown) {
      const d = dayOf(n);
      let key: string;
      let label: string;
      if (d > today) [key, label] = ['later', t('home.upcoming')];
      else if (d === today) [key, label] = ['today', t('calendar.today')];
      else if (d === y) [key, label] = ['yesterday', t('home.yesterday')];
      else if (d >= w) [key, label] = ['week', t('home.thisWeek')];
      else [key, label] = [d.slice(0, 7), monthFmt.format(parseIso(d))];
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push(n);
      else out.push({ key, label, items: [n] });
    }
    return out;
  }, [shown, today, dayOf, lang, t]);

  const shortDate = (iso: string) => new Intl.DateTimeFormat(lang, { day: 'numeric', month: 'short' }).format(parseIso(iso));
  const clock = (ms: number) => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : lang, { hour: '2-digit', minute: '2-digit' }).format(ms);

  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const ids = (id: string) => (selected.has(id) ? [...selected] : [id]);

  const dropProps = (key: string, target: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(PAGE_MIME)) return;
      e.preventDefault();
      setDropOn(key);
    },
    onDragLeave: () => setDropOn((d) => (d === key ? null : d)),
    onDrop: (e: DragEvent) => {
      const dragged = draggedPages(e.dataTransfer.getData(PAGE_MIME));
      setDropOn(null);
      if (!dragged.length) return;
      e.preventDefault();
      dragged.forEach((id) => void moveNote(id, target));
      setSelected(new Set());
    },
    'data-drop': dropOn === key,
  });

  const itemProps = (n: NoteSummary) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      e.dataTransfer.setData(PAGE_MIME, ids(n.id).join(','));
      e.dataTransfer.effectAllowed = 'move';
    },
    onClick: (e: MouseEvent) => {
      if (e.ctrlKey || e.metaKey || e.shiftKey || selected.size) toggleSelect(n.id);
      else open({ kind: 'page', id: n.id });
    },
    onContextMenu: (e: MouseEvent) => {
      e.preventDefault();
      setMenu({ x: e.clientX, y: e.clientY, ids: ids(n.id) });
    },
    'data-selected': selected.has(n.id),
  });

  const tags = (n: NoteSummary) => (
    <>
      {n.journal && <span className="ix-tag ix-tag-lapis">{t('home.tagJournal')}</span>}
      {n.parentId && (
        <span className="ix-tag" dir="auto">
          {notes.find((p) => p.id === n.parentId)?.title || t('page.untitled')}
        </span>
      )}
      {n.folderId && (
        <span className="ix-tag" dir="auto">
          {folderName(n.folderId)}
        </span>
      )}
    </>
  );

  /** The node on the timeline doubles as the selection box. */
  const node = (n: NoteSummary) => (
    <span
      className="tl-node"
      data-kind={n.journal ? 'journal' : n.pinned ? 'pinned' : 'page'}
      role="checkbox"
      aria-checked={selected.has(n.id)}
      aria-label={n.title || t('page.untitled')}
      onClick={(e) => {
        e.stopPropagation();
        toggleSelect(n.id);
      }}
    >
      {selected.has(n.id) && <Check size={10} strokeWidth={3} />}
    </span>
  );

  const menuTargets = menu ? live.filter((n) => menu.ids.includes(n.id)) : [];
  const allPinned = menuTargets.length > 0 && menuTargets.every((n) => n.pinned);

  return (
    <div className="page">
      <TopBar>
        <span className="crumb crumb-current">{t('pages.title')}</span>
      </TopBar>
      <div className="page-scroll" onClick={() => selected.size && !menu && setSelected(new Set())}>
        <div className="paper">
          <header className="all-head">
            <h1 className="t-display lede-title">
              {t('pages.title')}
              <span className="full-stop" aria-hidden="true" />
            </h1>
            <button className="text-action" onClick={() => void createNote({ folderId: targetFolder })}>
              {t('sidebar.newPage')}
              <ArrowUpRight size={14} strokeWidth={1.75} />
            </button>
          </header>

          <div className="spread">
            <section className="timeline-wrap">
              <div className="index-head">
                <h2 className="t-label">
                  {t('home.timeline')} <span className="index-count">{pad(shown.length)}</span>
                </h2>
                <div className="index-tools t-label">
                  <button className="text-tab" aria-pressed={basis === 'edited'} onClick={() => setBasis('edited')}>
                    {t('home.byEdited')}
                  </button>
                  <button className="text-tab" aria-pressed={basis === 'date'} onClick={() => setBasis('date')}>
                    {t('home.byDate')}
                  </button>
                  <span className="tools-sep" />
                  <button className="text-tab" aria-pressed={layout === 'timeline'} onClick={() => setLayout('timeline')}>
                    {t('home.timeline')}
                  </button>
                  <button className="text-tab" aria-pressed={layout === 'sheets'} onClick={() => setLayout('sheets')}>
                    {t('home.layoutSheets')}
                  </button>
                </div>
              </div>

              <div className="index-filter">
                <input dir="auto" value={query} placeholder={t('home.filter')} onChange={(e) => setQuery(e.target.value)} />
                {query && (
                  <button className="icon-btn sm" aria-label={t('common.cancel')} onClick={() => setQuery('')}>
                    <X size={14} />
                  </button>
                )}
              </div>

              <nav className="sections t-label" aria-label={t('home.folders')}>
                <button className="text-tab" aria-pressed={folder === 'all'} onClick={() => setFolder('all')}>
                  {t('home.all')} <span>{live.length}</span>
                </button>
                <button className="text-tab" aria-pressed={folder === 'none'} onClick={() => setFolder('none')} {...dropProps('none', null)}>
                  {t('home.unfiled')} <span>{live.filter((n) => !n.folderId).length}</span>
                </button>
                {filterLabel && (
                  <>
                    <span className="tools-sep" />
                    <span className="sections-current" dir="auto">
                      {filterLabel} <span>{shown.length}</span>
                    </span>
                    <button className="icon-btn sm" aria-label={t('home.all')} title={t('home.all')} onClick={() => setFolder('all')}>
                      <X size={13} />
                    </button>
                  </>
                )}
              </nav>

              {selected.size > 0 && (
                <div className="bulk-bar" onClick={(e) => e.stopPropagation()}>
                  <span>{t('home.selected', { count: selected.size })}</span>
                  <button className="bulk-btn" onClick={(e) => setMenu({ x: e.clientX, y: e.clientY, ids: [...selected], move: true })}>
                    <FolderInput size={15} strokeWidth={1.5} />
                    {t('page.moveTo')}
                  </button>
                  <button className="bulk-btn" onClick={() => [...selected].forEach((id) => void patchNote(id, { pinned: true }))}>
                    <Pin size={15} strokeWidth={1.5} />
                    {t('page.pin')}
                  </button>
                  <button
                    className="bulk-btn"
                    onClick={() => {
                      [...selected].forEach((id) => void trash(id));
                      setSelected(new Set());
                    }}
                  >
                    <Trash2 size={15} strokeWidth={1.5} />
                    {t('page.trash')}
                  </button>
                  <button className="bulk-btn" aria-label={t('common.cancel')} onClick={() => setSelected(new Set())}>
                    <X size={15} />
                  </button>
                </div>
              )}

              {shown.length === 0 ? (
                <div className="index-empty">
                  <p>{query ? t('find.noResults', { q: query }) : t('home.empty')}</p>
                  {!query && (
                    <button className="text-action" onClick={() => void createNote()}>
                      {t('sidebar.newPage')} <ArrowUpRight size={14} strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              ) : layout === 'timeline' ? (
                <div className="tl">
                  {groups.map((g) => (
                    <section key={g.key} className="tl-group">
                      <h3 className="tl-when t-label">
                        <span className="tl-when-dot" />
                        {g.label}
                        <span className="tl-when-count">{pad(g.items.length)}</span>
                      </h3>
                      <ol className="tl-items">
                        {g.items.map((n) => {
                          const d = dayOf(n);
                          const recent = g.key === 'today' || g.key === 'yesterday';
                          return (
                            <li key={n.id} className="tl-item" {...itemProps(n)}>
                              {node(n)}
                              <div className="tl-body">
                                <div className="tl-line">
                                  <span className={n.title ? 'tl-title' : 'tl-title t-muted'} dir="auto">
                                    <PageIcon value={n.icon} size={17} className="title-icon" />
                                    {n.title || t('page.untitled')}
                                  </span>
                                  <span className="tl-time t-label">
                                    {basis === 'edited' && recent ? clock(n.updatedAt) : shortDate(d)}
                                  </span>
                                </div>
                                {n.preview && (
                                  <p className="tl-excerpt" dir="auto">
                                    {n.preview}
                                  </p>
                                )}
                                {(n.journal || n.folderId || n.parentId) && <div className="ix-tags tl-tags">{tags(n)}</div>}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="sheets">
                  {shown.map((n, i) => (
                    <article key={n.id} className="sheet" {...itemProps(n)}>
                      <div className="sheet-top t-label">
                        <span>{pad(i + 1)}</span>
                        <span>{shortDate(dayOf(n))}</span>
                      </div>
                      <h3 className={n.title ? 'sheet-title' : 'sheet-title t-muted'} dir="auto">
                        <PageIcon value={n.icon} size={18} className="title-icon" />
                        {n.title || t('page.untitled')}
                      </h3>
                      <p className="sheet-preview" dir="auto">
                        {n.preview}
                      </p>
                      <div className="ix-tags">{tags(n)}</div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* The margin: the notebook's contents */}
            <aside className="margin">
              <Contents notes={live} filter={folder} onFilter={setFolder} dropProps={dropProps} />
            </aside>
          </div>
        </div>
      </div>

      {menu && (
        <div
          ref={menuRef}
          className="menu"
          role="menu"
          style={{ position: 'fixed', left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 260), zIndex: 60 }}
          onClick={(e) => e.stopPropagation()}
        >
          {menu.move ? (
            <>
              <div className="menu-label t-label">{t('page.moveTo')}</div>
              <button
                className="menu-item"
                onClick={() => {
                  menu.ids.forEach((id) => void moveNote(id, null));
                  closeMenu();
                  setSelected(new Set());
                }}
              >
                <FileText size={16} strokeWidth={1.5} />
                {t('page.noFolder')}
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  className="menu-item"
                  onClick={() => {
                    menu.ids.forEach((id) => void moveNote(id, f.id));
                    closeMenu();
                    setSelected(new Set());
                  }}
                >
                  <FolderIcon size={16} strokeWidth={1.5} />
                  <span className="grow" dir="auto">
                    {f.name}
                  </span>
                </button>
              ))}
            </>
          ) : (
            <>
              <button className="menu-item" onClick={() => setMenu({ ...menu, move: true })}>
                <FolderInput size={16} strokeWidth={1.5} />
                {t('page.moveTo')}
              </button>
              <button
                className="menu-item"
                onClick={() => {
                  menu.ids.forEach((id) => void patchNote(id, { pinned: !allPinned }));
                  closeMenu();
                }}
              >
                {allPinned ? <PinOff size={16} strokeWidth={1.5} /> : <Pin size={16} strokeWidth={1.5} />}
                {allPinned ? t('page.unpin') : t('page.pin')}
              </button>
              {menu.ids.length === 1 && (
                <button
                  className="menu-item"
                  onClick={() => {
                    void duplicate(menu.ids[0]);
                    closeMenu();
                  }}
                >
                  <Copy size={16} strokeWidth={1.5} />
                  {t('page.duplicate')}
                </button>
              )}
              <div className="menu-sep" />
              <button
                className="menu-item danger"
                onClick={() => {
                  menu.ids.forEach((id) => void trash(id));
                  closeMenu();
                  setSelected(new Set());
                }}
              >
                <Trash2 size={16} strokeWidth={1.5} />
                {t('page.trash')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
