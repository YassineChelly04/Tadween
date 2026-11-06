import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BookHeart,
  CalendarDays,
  ChevronRight,
  House,
  Library,
  Copy,
  CornerLeftUp,
  FilePlus2,
  FileText,
  Folder as FolderIcon,
  FolderOpen,
  FolderPlus,
  Lock,
  MoreHorizontal,
  PanelLeftClose,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  SquarePen,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../store';
import { useDismiss } from '../../lib/useDismiss';
import { Wordmark } from '../../components/Logo';
import { confirmDialog, toast } from '../../components/Dialogs';
import type { NoteSummary } from '../../lib/api';
import { PAGE_MIME, ancestors, byEdited, childrenOf, draggedPages, isTopLevel } from '../../lib/pages';
import { PageIcon } from '../../components/icons/PageIcon';

type RowMenu = { x: number; y: number; kind: 'page' | 'folder'; id: string } | null;
type SectionId = 'pinned' | 'folders' | 'recent';

// Which sidebar sections are folded away, kept between sessions.
const CLOSED_KEY = 'tadween.sidebar.closed';

function readClosed(): Set<SectionId> {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLOSED_KEY) ?? '[]'));
  } catch {
    return new Set();
  }
}

export function Sidebar() {
  const { t } = useTranslation();
  const notes = useApp((s) => s.notes);
  const folders = useApp((s) => s.folders);
  const view = useApp((s) => s.view);
  const open = useApp((s) => s.open);
  const createNote = useApp((s) => s.createNote);
  const createSubPage = useApp((s) => s.createSubPage);
  const nestNote = useApp((s) => s.nestNote);
  const createFolder = useApp((s) => s.createFolder);
  const renameFolder = useApp((s) => s.renameFolder);
  const deleteFolder = useApp((s) => s.deleteFolder);
  const pinFolder = useApp((s) => s.pinFolder);
  const moveNote = useApp((s) => s.moveNote);
  const togglePin = useApp((s) => s.togglePin);
  const duplicate = useApp((s) => s.duplicate);
  const trash = useApp((s) => s.trash);
  const lock = useApp((s) => s.lock);
  const setSidebar = useApp((s) => s.setSidebar);
  const setFind = useApp((s) => s.setFind);
  const openSettings = useApp((s) => s.openSettings);
  const username = useApp((s) => s.displayName || s.username);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [closed, setClosed] = useState<Set<SectionId>>(readClosed);
  const [naming, setNaming] = useState<{ id: string | null; value: string } | null>(null);
  const [menu, setMenu] = useState<RowMenu>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const committing = useRef(false);
  const closeMenu = useCallback(() => setMenu(null), []);
  useDismiss(menuRef, menu !== null, closeMenu);

  const live = useMemo(() => notes.filter((n) => !n.trashedAt), [notes]);
  // Only pinned folders live here; every folder is in All pages, in its contents.
  const pinnedFolders = folders.filter((f) => f.pinned);
  const pinned = live.filter((n) => n.pinned);
  // The sidebar stays short: only the latest pages; everything else is in All pages.
  // Sub-pages are listed under their parent, not a second time here.
  const recent = useMemo(() => live.filter((n) => !n.pinned && isTopLevel(live, n)).sort(byEdited).slice(0, 6), [live]);
  const trashCount = notes.length - live.length;
  const activeId = view.kind === 'page' ? view.id : null;

  // Opening a sub-page unfolds the way to it, so the sidebar shows where you are.
  const parentPath = useMemo(() => (activeId ? ancestors(live, activeId).map((n) => n.id).join(',') : ''), [live, activeId]);
  useEffect(() => {
    if (parentPath) setExpanded((s) => new Set([...s, ...parentPath.split(',')]));
  }, [parentPath]);

  const toggle = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  useEffect(() => {
    try {
      localStorage.setItem(CLOSED_KEY, JSON.stringify([...closed]));
    } catch {
      /* not remembered: fine */
    }
  }, [closed]);

  const setSection = (id: SectionId, open: boolean) =>
    setClosed((s) => {
      const next = new Set(s);
      if (open) next.delete(id);
      else next.add(id);
      return next;
    });
  const sectionProps = (id: SectionId) => ({
    open: !closed.has(id),
    onOpenChange: (open: boolean) => setSection(id, open),
  });

  // Enter and blur both commit; the ref keeps that to a single write.
  const commitName = async () => {
    if (!naming || committing.current) return;
    committing.current = true;
    const value = naming.value.trim();
    setNaming(null);
    try {
      if (!value) return;
      if (naming.id) await renameFolder(naming.id, value);
      else {
        // Made here, so it belongs here: a new folder starts pinned.
        const f = await createFolder(value);
        await pinFolder(f.id, true);
        setExpanded((s) => new Set(s).add(f.id));
      }
    } finally {
      committing.current = false;
    }
  };

  const dropProps = (key: string, folderId: string | null) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(PAGE_MIME)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDropTarget(key);
    },
    onDragLeave: () => setDropTarget((d) => (d === key ? null : d)),
    onDrop: (e: DragEvent) => {
      const ids = draggedPages(e.dataTransfer.getData(PAGE_MIME));
      setDropTarget(null);
      if (!ids.length) return;
      e.preventDefault();
      ids.forEach((id) => void moveNote(id, folderId));
      if (folderId) setExpanded((s) => new Set(s).add(folderId));
    },
    'data-drop': dropTarget === key,
  });

  const addInside = (id: string) => {
    setExpanded((s) => new Set(s).add(id));
    void createSubPage(id).then((child) => open({ kind: 'page', id: child }));
  };

  /** Dropping a page on a page puts it inside. */
  const pageDrop = (target: string) => {
    const key = `page-${target}`;
    return {
      onDragOver: (e: DragEvent) => {
        if (!e.dataTransfer.types.includes(PAGE_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTarget(key);
      },
      onDragLeave: () => setDropTarget((d) => (d === key ? null : d)),
      onDrop: (e: DragEvent) => {
        const ids = draggedPages(e.dataTransfer.getData(PAGE_MIME)).filter((id) => id !== target);
        setDropTarget(null);
        if (!ids.length) return;
        e.preventDefault();
        setExpanded((s) => new Set(s).add(target));
        ids.forEach((id) => nestNote(id, target).catch(() => toast(t('page.cannotNest'))));
      },
      'data-drop': dropTarget === key,
    };
  };

  /** A page, and when it is open the pages inside it. `path` guards against a loop in the data. */
  const pageRow = (n: NoteSummary, depth = 0, path: string[] = []): ReactNode => {
    if (path.includes(n.id)) return null;
    const inside = childrenOf(live, n.id);
    const isOpen = expanded.has(n.id);
    return (
      <Fragment key={n.id}>
        <button
          className="side-row page-row"
          style={{ paddingInlineStart: 10 + depth * 14 }}
          data-active={n.id === activeId}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(PAGE_MIME, n.id);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onClick={() => open({ kind: 'page', id: n.id })}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY, kind: 'page', id: n.id });
          }}
          {...pageDrop(n.id)}
        >
          {inside.length > 0 && (
            <span
              className="side-toggle"
              role="button"
              aria-label={isOpen ? t('home.collapse') : t('home.expand')}
              aria-expanded={isOpen}
              onClick={(e: MouseEvent) => {
                e.stopPropagation();
                toggle(n.id);
              }}
            >
              <ChevronRight size={13} strokeWidth={2} className="side-chevron" data-open={isOpen} />
            </span>
          )}
          {n.icon ? (
            <PageIcon value={n.icon} size={15} className="side-icon" />
          ) : n.journal ? (
            <BookHeart size={15} strokeWidth={1.5} className="side-icon" />
          ) : (
            <FileText size={15} strokeWidth={1.5} className="side-icon" />
          )}
          <span className={n.title ? 'side-label' : 'side-label t-muted'} dir="auto">
            {n.title || t('page.untitled')}
          </span>
          <span
            className="side-more"
            role="button"
            aria-label={t('page.addInside')}
            title={t('page.addInside')}
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              addInside(n.id);
            }}
          >
            <Plus size={15} strokeWidth={1.5} />
          </span>
          <span
            className="side-more"
            role="button"
            aria-label={t('page.more')}
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setMenu({ x: r.left, y: r.bottom + 4, kind: 'page', id: n.id });
            }}
          >
            <MoreHorizontal size={15} strokeWidth={1.5} />
          </span>
        </button>
        {isOpen && inside.map((c) => pageRow(c, depth + 1, [...path, n.id]))}
      </Fragment>
    );
  };

  const menuNote = menu?.kind === 'page' ? notes.find((n) => n.id === menu.id) : null;
  const menuFolder = menu?.kind === 'folder' ? folders.find((f) => f.id === menu.id) : null;

  return (
    <aside className="sidebar">
      <div className="side-head" data-tauri-drag-region>
        <Wordmark size={20} />
        <button className="icon-btn" aria-label={t('sidebar.collapse')} title={`${t('sidebar.collapse')}  Ctrl \\`} onClick={() => setSidebar(false)}>
          <PanelLeftClose size={16} strokeWidth={1.5} />
        </button>
      </div>

      <div className="side-actions">
        <button className="side-row" data-active={view.kind === 'home'} onClick={() => open({ kind: 'home' })}>
          <House size={15} strokeWidth={1.5} className="side-icon" />
          <span className="side-label">{t('home.title')}</span>
        </button>
        <button className="side-row" data-tour="all-pages" data-active={view.kind === 'pages'} onClick={() => open({ kind: 'pages' })}>
          <Library size={15} strokeWidth={1.5} className="side-icon" />
          <span className="side-label">{t('pages.title')}</span>
        </button>
        <button className="side-row" data-tour="journal" data-active={view.kind === 'calendar'} onClick={() => open({ kind: 'calendar' })}>
          <CalendarDays size={15} strokeWidth={1.5} className="side-icon" />
          <span className="side-label">{t('calendar.title')}</span>
        </button>
        <button className="side-row" data-tour="search" onClick={() => setFind(true)}>
          <Search size={15} strokeWidth={1.5} className="side-icon" />
          <span className="side-label">{t('sidebar.search')}</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button className="side-row" data-tour="new-page" onClick={() => void createNote()}>
          <SquarePen size={15} strokeWidth={1.5} className="side-icon" />
          <span className="side-label">{t('sidebar.newPage')}</span>
          <kbd>Ctrl N</kbd>
        </button>
      </div>

      <nav className="side-scroll">
        {pinned.length > 0 && (
          <Section title={t('sidebar.pinned')} {...sectionProps('pinned')}>
            {pinned.map((n) => pageRow(n))}
          </Section>
        )}

        <Section
          title={t('sidebar.folders')}
          {...sectionProps('folders')}
          action={
            <button
              className="icon-btn sm"
              aria-label={t('sidebar.newFolder')}
              title={t('sidebar.newFolder')}
              onClick={() => {
                setSection('folders', true);
                setNaming({ id: null, value: '' });
              }}
            >
              <FolderPlus size={14} strokeWidth={1.5} />
            </button>
          }
        >
          {pinnedFolders.length === 0 && !naming && (
            <button className="side-row side-more-row" onClick={() => open({ kind: 'pages' })}>
              <span className="side-label">{t('sidebar.noPinnedFolders')}</span>
            </button>
          )}
          {pinnedFolders.map((f) => {
            const inside = live.filter((n) => n.folderId === f.id && isTopLevel(live, n));
            const isOpen = expanded.has(f.id);
            if (naming?.id === f.id) {
              return <NameInput key={f.id} value={naming.value} onChange={(value) => setNaming({ id: f.id, value })} onCommit={commitName} onCancel={() => setNaming(null)} placeholder={t('sidebar.folderName')} />;
            }
            return (
              <div key={f.id}>
                <button
                  className="side-row folder-row"
                  aria-expanded={isOpen}
                  onClick={() => toggle(f.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({ x: e.clientX, y: e.clientY, kind: 'folder', id: f.id });
                  }}
                  {...dropProps(f.id, f.id)}
                >
                  <ChevronRight size={13} strokeWidth={2} className="side-chevron" data-open={isOpen} />
                  {isOpen ? <FolderOpen size={15} strokeWidth={1.5} className="side-icon" /> : <FolderIcon size={15} strokeWidth={1.5} className="side-icon" />}
                  <span className="side-label" dir="auto" title={f.name}>
                    {f.name.split(' / ').pop()}
                  </span>
                  <span className="side-count">{inside.length || ''}</span>
                  <span
                    className="side-more"
                    role="button"
                    aria-label={t('sidebar.newPageIn')}
                    title={t('sidebar.newPageIn')}
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      setExpanded((s) => new Set(s).add(f.id));
                      void createNote({ folderId: f.id });
                    }}
                  >
                    <Plus size={15} strokeWidth={1.5} />
                  </span>
                  <span
                    className="side-more"
                    role="button"
                    aria-label={t('page.more')}
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      setMenu({ x: r.left, y: r.bottom + 4, kind: 'folder', id: f.id });
                    }}
                  >
                    <MoreHorizontal size={15} strokeWidth={1.5} />
                  </span>
                </button>
                {isOpen &&
                  (inside.length ? (
                    <>
                      {inside.slice(0, 8).map((n) => pageRow(n, 1))}
                      {inside.length > 8 && (
                        <button className="side-row side-more-row" onClick={() => open({ kind: 'pages', folder: f.id })}>
                          <span className="side-label">{t('sidebar.showAll', { count: inside.length })}</span>
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="side-empty">{t('sidebar.emptyFolder')}</div>
                  ))}
              </div>
            );
          })}
          {naming && naming.id === null && (
            <NameInput value={naming.value} onChange={(value) => setNaming({ id: null, value })} onCommit={commitName} onCancel={() => setNaming(null)} placeholder={t('sidebar.folderName')} />
          )}
        </Section>

        <Section title={t('sidebar.recent')} {...sectionProps('recent')}>
          {recent.length ? recent.map((n) => pageRow(n)) : <div className="side-empty">{t('sidebar.noPages')}</div>}
          {live.length > recent.length + pinned.length && (
            <button className="side-row side-more-row" onClick={() => open({ kind: 'pages' })}>
              <span className="side-label">{t('sidebar.allPages', { count: live.length })}</span>
            </button>
          )}
        </Section>
      </nav>

      <div className="side-foot">
        <button className="side-row" data-active={view.kind === 'trash'} onClick={() => open({ kind: 'trash' })}>
          <Trash2 size={15} strokeWidth={1.5} className="side-icon" />
          <span className="side-label">{t('sidebar.trash')}</span>
          <span className="side-count">{trashCount || ''}</span>
        </button>
        <button className="side-row" onClick={() => openSettings('general')}>
          <Settings size={15} strokeWidth={1.5} className="side-icon" />
          <span className="side-label">{t('sidebar.settings')}</span>
        </button>
        <button className="side-row" data-tour="lock" onClick={() => void lock()}>
          <Lock size={15} strokeWidth={1.5} className="side-icon" />
          <span className="side-label">{t('sidebar.lock')}</span>
          <kbd>Ctrl L</kbd>
        </button>
        {username && (
          <div className="side-account" title={username}>
            <span className="avatar" aria-hidden="true">
              {[...username][0]?.toUpperCase()}
            </span>
            <span className="side-label" dir="auto">
              {username}
            </span>
          </div>
        )}
      </div>

      {menu && (
        <div ref={menuRef} className="menu" role="menu" style={{ position: 'fixed', left: Math.min(menu.x, window.innerWidth - 240), top: Math.min(menu.y, window.innerHeight - 200) }}>
          {menuNote && (
            <>
              <button className="menu-item" role="menuitem" onClick={() => (closeMenu(), addInside(menuNote.id))}>
                <FilePlus2 size={16} strokeWidth={1.5} />
                {t('page.addInside')}
              </button>
              {menuNote.parentId && (
                <button className="menu-item" role="menuitem" onClick={() => (closeMenu(), void nestNote(menuNote.id, null))}>
                  <CornerLeftUp size={16} strokeWidth={1.5} />
                  {t('page.moveOut')}
                </button>
              )}
              <button className="menu-item" role="menuitem" onClick={() => (closeMenu(), void togglePin(menuNote.id))}>
                {menuNote.pinned ? <PinOff size={16} strokeWidth={1.5} /> : <Pin size={16} strokeWidth={1.5} />}
                {menuNote.pinned ? t('page.unpin') : t('page.pin')}
              </button>
              <button className="menu-item" role="menuitem" onClick={() => (closeMenu(), void duplicate(menuNote.id))}>
                <Copy size={16} strokeWidth={1.5} />
                {t('page.duplicate')}
              </button>
              <div className="menu-sep" />
              <button className="menu-item danger" role="menuitem" onClick={() => (closeMenu(), void trash(menuNote.id))}>
                <Trash2 size={16} strokeWidth={1.5} />
                {t('page.trash')}
              </button>
            </>
          )}
          {menuFolder && (
            <>
              <button className="menu-item" role="menuitem" onClick={() => (closeMenu(), setNaming({ id: menuFolder.id, value: menuFolder.name }))}>
                <Pencil size={16} strokeWidth={1.5} />
                {t('common.rename')}
              </button>
              <button className="menu-item" role="menuitem" onClick={() => (closeMenu(), void pinFolder(menuFolder.id, false))}>
                <PinOff size={16} strokeWidth={1.5} />
                {t('sidebar.unpinFolder')}
              </button>
              <button className="menu-item" role="menuitem" onClick={() => (closeMenu(), open({ kind: 'pages', folder: menuFolder.id }))}>
                <FolderOpen size={16} strokeWidth={1.5} />
                {t('sidebar.showInPages')}
              </button>
              <div className="menu-sep" />
              <button
                className="menu-item danger"
                role="menuitem"
                onClick={async () => {
                  closeMenu();
                  if (await confirmDialog(t('sidebar.deleteFolder', { name: menuFolder.name }), { confirmLabel: t('common.delete'), danger: true })) {
                    void deleteFolder(menuFolder.id);
                  }
                }}
              >
                <Trash2 size={16} strokeWidth={1.5} />
                {t('common.delete')}
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  );
}

function Section({
  title,
  open,
  onOpenChange,
  action,
  children,
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="side-section">
      <div className="side-section-head">
        <h2 className="side-section-title">
          <button
            className="side-section-toggle"
            aria-expanded={open}
            onClick={() => onOpenChange(!open)}
            // A folded section still takes a dragged page: holding it over the name opens it.
            onDragEnter={(e) => {
              if (!open && e.dataTransfer.types.includes(PAGE_MIME)) onOpenChange(true);
            }}
          >
            <span className="side-section-name">{title}</span>
            <ChevronRight size={13} strokeWidth={2} className="side-chevron" data-open={open} />
          </button>
        </h2>
        {action}
      </div>
      {open && children}
    </section>
  );
}

function NameInput({
  value,
  onChange,
  onCommit,
  onCancel,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  placeholder: string;
}) {
  return (
    <div className="side-row side-input">
      <FolderIcon size={15} strokeWidth={1.5} className="side-icon" />
      <input
        autoFocus
        dir="auto"
        value={value}
        placeholder={placeholder}
        maxLength={120}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit();
          if (e.key === 'Escape') onCancel();
        }}
      />
    </div>
  );
}
