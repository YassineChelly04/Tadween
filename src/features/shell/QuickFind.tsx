import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { CornerDownLeft, FileText, Search } from 'lucide-react';
import { api, type SearchHit } from '../../lib/api';
import { relativeTime } from '../../lib/time';
import { useApp } from '../../store';
import { PageIcon } from '../../components/icons/PageIcon';

interface Row {
  id: string;
  title: string;
  detail: string;
  folder: string | null;
}

export function QuickFind() {
  const { t, i18n } = useTranslation();
  const open = useApp((s) => s.findOpen);
  const setFind = useApp((s) => s.setFind);
  const openView = useApp((s) => s.open);
  const notes = useApp((s) => s.notes);
  const folders = useApp((s) => s.folders);
  const iconOf = (id: string) => notes.find((n) => n.id === id)?.icon ?? null;
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setHits([]);
      setSelected(0);
    }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) return setHits([]);
    let alive = true;
    const id = window.setTimeout(() => {
      void api.search(query).then((r) => alive && setHits(r));
    }, 80);
    return () => {
      alive = false;
      window.clearTimeout(id);
    };
  }, [query]);

  const folderName = (id: string | null) => folders.find((f) => f.id === id)?.name ?? null;

  const rows: Row[] = useMemo(() => {
    if (query.trim()) {
      return hits.map((h) => ({ id: h.id, title: h.title, detail: h.snippet, folder: folderName(h.folderId) }));
    }
    return notes
      .filter((n) => !n.trashedAt)
      .slice(0, 8)
      .map((n) => ({ id: n.id, title: n.title, detail: relativeTime(n.updatedAt, i18n.language), folder: folderName(n.folderId) }));
  }, [query, hits, notes, folders, i18n.language]);

  useEffect(() => setSelected(0), [rows.length]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const choose = (row: Row | undefined) => {
    if (row) openView({ kind: 'page', id: row.id });
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay overlay-top"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          onMouseDown={(e) => e.target === e.currentTarget && setFind(false)}
        >
          <motion.div
            className="dialog finder"
            role="dialog"
            aria-modal="true"
            aria-label={t('sidebar.search')}
            initial={{ opacity: 0, y: -8, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.985 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="finder-input">
              <Search size={18} strokeWidth={1.5} />
              <input
                autoFocus
                dir="auto"
                value={query}
                placeholder={t('find.placeholder')}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setFind(false);
                  else if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setSelected((s) => Math.min(rows.length - 1, s + 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setSelected((s) => Math.max(0, s - 1));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    choose(rows[selected]);
                  }
                }}
              />
            </div>
            <div className="finder-list" ref={listRef}>
              <div className="menu-label t-label">{query.trim() ? t('find.results') : t('find.recent')}</div>
              {rows.length === 0 && query.trim() && <div className="finder-empty t-muted">{t('find.noResults', { q: query.trim() })}</div>}
              {rows.map((r, i) => (
                <button
                  key={r.id}
                  data-index={i}
                  data-active={i === selected}
                  className="finder-row"
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => choose(r)}
                >
                  {iconOf(r.id) ? <PageIcon value={iconOf(r.id)} size={16} /> : <FileText size={16} strokeWidth={1.5} />}
                  <span className="finder-text">
                    <span className="finder-title">
                      <span dir="auto" className={r.title ? '' : 't-muted'}>
                        {r.title || t('page.untitled')}
                      </span>
                      {r.folder && (
                        <span className="finder-folder" dir="auto">
                          {r.folder}
                        </span>
                      )}
                    </span>
                    {r.detail && (
                      <span className="finder-detail" dir="auto">
                        {r.detail}
                      </span>
                    )}
                  </span>
                  {i === selected && <CornerDownLeft size={14} className="finder-enter" />}
                </button>
              ))}
            </div>
            <div className="finder-foot t-label">
              <span>
                <kbd>↑↓</kbd> {t('find.navigate')}
              </span>
              <span>
                <kbd>Enter</kbd> {t('find.open')}
              </span>
              <span>
                <kbd>Esc</kbd>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
