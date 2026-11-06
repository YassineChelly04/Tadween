import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, RotateCcw, Trash2 } from 'lucide-react';
import { useApp } from '../../store';
import { relativeTime } from '../../lib/time';
import { confirmDialog } from '../../components/Dialogs';
import { TopBar } from './TopBar';

export function TrashView() {
  const { t, i18n } = useTranslation();
  const all = useApp((s) => s.notes);
  const notes = useMemo(
    () => all.filter((n) => n.trashedAt).sort((a, b) => (b.trashedAt ?? 0) - (a.trashedAt ?? 0)),
    [all],
  );
  const open = useApp((s) => s.open);
  const restore = useApp((s) => s.restore);
  const deleteForever = useApp((s) => s.deleteForever);
  const emptyTrash = useApp((s) => s.emptyTrash);

  return (
    <div className="page">
      <TopBar
        actions={
          notes.length > 0 && (
            <button
              className="btn btn-danger btn-sm"
              onClick={async () => {
                if (await confirmDialog(t('trash.emptyConfirm', { count: notes.length }), { confirmLabel: t('trash.empty'), danger: true })) {
                  void emptyTrash();
                }
              }}
            >
              {t('trash.empty')}
            </button>
          )
        }
      >
        <span className="crumb crumb-current">{t('trash.title')}</span>
      </TopBar>
      <div className="page-scroll">
        <div className="page-body">
          <h1 className="t-display page-title static">{t('trash.title')}</h1>
          {notes.length === 0 ? (
            <p className="t-muted trash-empty">{t('trash.nothing')}</p>
          ) : (
            <ul className="trash-list">
              {notes.map((n) => (
                <li key={n.id}>
                  <button className="trash-open" onClick={() => open({ kind: 'page', id: n.id })}>
                    <FileText size={16} strokeWidth={1.5} />
                    <span className="trash-text">
                      <span dir="auto" className={n.title ? '' : 't-muted'}>
                        {n.title || t('page.untitled')}
                      </span>
                      <small className="t-label">{t('trash.trashed', { time: relativeTime(n.trashedAt ?? 0, i18n.language) })}</small>
                    </span>
                  </button>
                  <button className="icon-btn" aria-label={t('page.restore')} title={t('page.restore')} onClick={() => void restore(n.id)}>
                    <RotateCcw size={16} strokeWidth={1.5} />
                  </button>
                  <button
                    className="icon-btn danger"
                    aria-label={t('page.deleteForever')}
                    title={t('page.deleteForever')}
                    onClick={async () => {
                      if (await confirmDialog(t('page.deleteConfirm'), { confirmLabel: t('page.deleteForever'), danger: true })) {
                        void deleteForever(n.id);
                      }
                    }}
                  >
                    <Trash2 size={16} strokeWidth={1.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
