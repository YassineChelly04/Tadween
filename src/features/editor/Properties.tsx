import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BookHeart, CalendarDays, Check, Folder as FolderIcon } from 'lucide-react';
import { useApp } from '../../store';
import { useDismiss } from '../../lib/useDismiss';
import { formatDay, isoDate } from '../../lib/dates';
import { DatePicker } from '../../components/DatePicker';

/** Notion-style properties under the title: date, daily journal, folder. */
export function Properties({ noteId, readOnly }: { noteId: string; readOnly: boolean }) {
  const { t, i18n } = useTranslation();
  const note = useApp((s) => s.notes.find((n) => n.id === noteId));
  const folders = useApp((s) => s.folders);
  const patchNote = useApp((s) => s.patchNote);
  const [open, setOpen] = useState<'date' | 'folder' | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(null), []);
  useDismiss(ref, open !== null, close);

  if (!note) return null;
  const folder = folders.find((f) => f.id === note.folderId);

  return (
    <div className="props" ref={ref} data-tour="page-props">
      <div className="prop">
        <span className="prop-name">
          <CalendarDays size={15} strokeWidth={1.5} />
          {t('properties.date')}
        </span>
        <div className="popover-anchor">
          <button className="prop-value" disabled={readOnly} onClick={() => setOpen(open === 'date' ? null : 'date')}>
            {note.date ? formatDay(note.date, i18n.language) : <span className="t-muted">{t('properties.empty')}</span>}
          </button>
          {open === 'date' && (
            <div className="menu popover-start">
              <DatePicker
                value={note.date}
                onChange={(date) => {
                  close();
                  void patchNote(noteId, { date });
                }}
              />
            </div>
          )}
        </div>
      </div>

      <div className="prop">
        <span className="prop-name">
          <BookHeart size={15} strokeWidth={1.5} />
          {t('properties.journal')}
        </span>
        <button
          className="prop-value prop-toggle"
          role="switch"
          aria-checked={note.journal}
          disabled={readOnly}
          onClick={() =>
            void patchNote(noteId, {
              journal: !note.journal,
              // A journal entry needs a day; default to the day it was written.
              ...(!note.journal && !note.date ? { date: isoDate(new Date(note.createdAt)) } : {}),
            })
          }
        >
          <span className="checkbox-box" data-on={note.journal}>
            {note.journal && <Check size={12} strokeWidth={2.5} />}
          </span>
          <span className={note.journal ? '' : 't-muted'}>{note.journal ? t('properties.journalOn') : t('properties.journalOff')}</span>
        </button>
      </div>

      <div className="prop">
        <span className="prop-name">
          <FolderIcon size={15} strokeWidth={1.5} />
          {t('properties.folder')}
        </span>
        <div className="popover-anchor">
          <button className="prop-value" disabled={readOnly} onClick={() => setOpen(open === 'folder' ? null : 'folder')}>
            {folder ? <span dir="auto">{folder.name}</span> : <span className="t-muted">{t('properties.empty')}</span>}
          </button>
          {open === 'folder' && (
            <div className="menu popover-start" role="menu">
              <button
                className="menu-item"
                onClick={() => {
                  close();
                  void patchNote(noteId, { folderId: null });
                }}
              >
                <span className="grow">{t('page.noFolder')}</span>
                {!folder && <Check size={14} />}
              </button>
              {folders.map((f) => (
                <button
                  key={f.id}
                  className="menu-item"
                  onClick={() => {
                    close();
                    void patchNote(noteId, { folderId: f.id });
                  }}
                >
                  <FolderIcon size={15} strokeWidth={1.5} />
                  <span className="grow" dir="auto">
                    {f.name}
                  </span>
                  {f.id === note.folderId && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
