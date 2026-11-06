import { Fragment, useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, CornerLeftUp, FilePlus2, Folder, FolderInput, MoreHorizontal, PanelLeft, Pin, PinOff, Trash2, FileText, Check } from 'lucide-react';
import { PageIcon } from '../../components/icons/PageIcon';
import { useApp } from '../../store';
import { ancestors } from '../../lib/pages';
import { useDismiss } from '../../lib/useDismiss';
import type { SaveState } from '../editor/PageView';

export function TopBar({ children, actions }: { children?: ReactNode; actions?: ReactNode }) {
  const { t } = useTranslation();
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const setSidebar = useApp((s) => s.setSidebar);
  return (
    <div className="topbar" data-tauri-drag-region>
      {!sidebarOpen && (
        <button className="icon-btn" aria-label={t('sidebar.expand')} title={`${t('sidebar.expand')}  Ctrl \\`} onClick={() => setSidebar(true)}>
          <PanelLeft size={17} strokeWidth={1.5} />
        </button>
      )}
      <div className="topbar-crumbs" data-tauri-drag-region>
        {children}
      </div>
      <div className="topbar-actions" data-tour="page-actions">
        {actions}
      </div>
    </div>
  );
}

/** The path to a page: its folder, then the pages around it, each one a way back. */
function PageCrumbs({ noteId, folderId }: { noteId: string; folderId: string | null | undefined }) {
  const { t } = useTranslation();
  const notes = useApp((s) => s.notes);
  const folders = useApp((s) => s.folders);
  const open = useApp((s) => s.open);
  const folder = folders.find((f) => f.id === folderId);
  const parents = useMemo(() => ancestors(notes, noteId), [notes, noteId]);
  // A deep page shows where it starts and what holds it, not the whole way.
  const shown = parents.length > 2 ? [parents[0], null, parents[parents.length - 1]] : parents;
  return (
    <>
      {folder && (
        <>
          <button className="crumb crumb-link" dir="auto" onClick={() => open({ kind: 'pages', folder: folder.id })}>
            {folder.name}
          </button>
          <span className="crumb-sep">/</span>
        </>
      )}
      {shown.map((p, i) => (
        <Fragment key={p?.id ?? `gap-${i}`}>
          {p ? (
            <button className="crumb crumb-link" dir="auto" onClick={() => open({ kind: 'page', id: p.id })}>
              <PageIcon value={p.icon} size={14} className="title-icon" />
              {p.title || t('page.untitled')}
            </button>
          ) : (
            <span className="crumb">…</span>
          )}
          <span className="crumb-sep">/</span>
        </Fragment>
      ))}
    </>
  );
}

export function PageTopBar({ noteId, title, saveState }: { noteId: string; title: string; saveState: SaveState }) {
  const { t } = useTranslation();
  const note = useApp((s) => s.notes.find((n) => n.id === noteId));
  const folders = useApp((s) => s.folders);
  const open = useApp((s) => s.open);
  const createSubPage = useApp((s) => s.createSubPage);
  const nestNote = useApp((s) => s.nestNote);
  const togglePin = useApp((s) => s.togglePin);
  const moveNote = useApp((s) => s.moveNote);
  const duplicate = useApp((s) => s.duplicate);
  const trash = useApp((s) => s.trash);
  const [menu, setMenu] = useState<'main' | 'move' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setMenu(null), []);
  useDismiss(ref, menu !== null, close);

  const trashed = !!note?.trashedAt;

  return (
    <TopBar
      actions={
        <>
          <span className="t-label save-state" data-state={saveState} aria-live="polite">
            {t(`page.${saveState === 'failed' ? 'notSaved' : saveState}`)}
          </span>
          {!trashed && note && (
            <button
              className="icon-btn"
              aria-pressed={note.pinned}
              aria-label={note.pinned ? t('page.unpin') : t('page.pin')}
              title={note.pinned ? t('page.unpin') : t('page.pin')}
              onClick={() => void togglePin(noteId)}
            >
              {note.pinned ? <PinOff size={16} strokeWidth={1.5} /> : <Pin size={16} strokeWidth={1.5} />}
            </button>
          )}
          {!trashed && (
            <div className="popover-anchor" ref={ref}>
              <button
                className="icon-btn"
                aria-label={t('page.more')}
                title={t('page.more')}
                aria-haspopup="menu"
                aria-expanded={menu !== null}
                onClick={() => setMenu(menu ? null : 'main')}
              >
                <MoreHorizontal size={17} strokeWidth={1.5} />
              </button>
              {menu === 'main' && (
                <div className="menu popover-end" role="menu">
                  <button
                    className="menu-item"
                    role="menuitem"
                    onClick={() => {
                      close();
                      void createSubPage(noteId).then((id) => open({ kind: 'page', id }));
                    }}
                  >
                    <FilePlus2 size={16} strokeWidth={1.5} />
                    {t('page.addInside')}
                  </button>
                  <button className="menu-item" role="menuitem" onClick={() => setMenu('move')}>
                    <FolderInput size={16} strokeWidth={1.5} />
                    {t('page.moveTo')}
                  </button>
                  {note?.parentId && (
                    <button
                      className="menu-item"
                      role="menuitem"
                      onClick={() => {
                        close();
                        void nestNote(noteId, null);
                      }}
                    >
                      <CornerLeftUp size={16} strokeWidth={1.5} />
                      {t('page.moveOut')}
                    </button>
                  )}
                  <button
                    className="menu-item"
                    role="menuitem"
                    onClick={() => {
                      close();
                      void duplicate(noteId);
                    }}
                  >
                    <Copy size={16} strokeWidth={1.5} />
                    {t('page.duplicate')}
                  </button>
                  <div className="menu-sep" />
                  <button
                    className="menu-item danger"
                    role="menuitem"
                    onClick={() => {
                      close();
                      void trash(noteId);
                    }}
                  >
                    <Trash2 size={16} strokeWidth={1.5} />
                    {t('page.trash')}
                  </button>
                </div>
              )}
              {menu === 'move' && (
                <div className="menu popover-end" role="menu">
                  <div className="menu-label t-label">{t('page.moveTo')}</div>
                  <button
                    className="menu-item"
                    role="menuitemradio"
                    aria-checked={!note?.folderId}
                    onClick={() => {
                      close();
                      void moveNote(noteId, null);
                    }}
                  >
                    <FileText size={16} strokeWidth={1.5} />
                    <span className="grow">{t('page.noFolder')}</span>
                    {!note?.folderId && <Check size={14} />}
                  </button>
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      className="menu-item"
                      role="menuitemradio"
                      aria-checked={note?.folderId === f.id}
                      onClick={() => {
                        close();
                        void moveNote(noteId, f.id);
                      }}
                    >
                      <Folder size={16} strokeWidth={1.5} />
                      <span className="grow" dir="auto">
                        {f.name}
                      </span>
                      {note?.folderId === f.id && <Check size={14} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      }
    >
      <PageCrumbs noteId={noteId} folderId={note?.folderId} />
      <span className="crumb crumb-current" dir="auto">
        <PageIcon value={note?.icon} size={14} className="title-icon" />
        {title || t('page.untitled')}
      </span>
    </TopBar>
  );
}
