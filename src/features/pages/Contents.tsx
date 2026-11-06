import { useMemo, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Pin } from 'lucide-react';
import { useApp } from '../../store';
import type { Folder, NoteSummary } from '../../lib/api';
import { PageIcon } from '../../components/icons/PageIcon';

// The margin of All pages is the notebook's contents page, the way a printed book
// opens: numbered parts, their sections indented under them, page counts in
// mono on the right. Folder names written as paths ("Client / Leads", as
// Notion and Obsidian imports produce) become parts and sections. Each folder
// can be pinned to the sidebar from here, which is the only place the
// sidebar takes folders from.

export interface TreeNode {
  /** Full path, "Client / Leads". */
  path: string;
  name: string;
  folder: Folder | null;
  children: TreeNode[];
  pages: NoteSummary[];
  /** Pages here and in every section below. */
  total: number;
}

const SEP = ' / ';
const PAGES_SHOWN = 6;

function buildTree(folders: Folder[], notes: NoteSummary[]): TreeNode[] {
  const byPath = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  const node = (path: string): TreeNode => {
    const known = byPath.get(path);
    if (known) return known;
    const parts = path.split(SEP);
    const n: TreeNode = { path, name: parts[parts.length - 1], folder: null, children: [], pages: [], total: 0 };
    byPath.set(path, n);
    if (parts.length > 1) node(parts.slice(0, -1).join(SEP)).children.push(n);
    else roots.push(n);
    return n;
  };
  const sorted = [...folders].sort((a, b) => a.name.localeCompare(b.name));
  for (const f of sorted) node(f.name.trim()).folder = f;
  const byId = new Map(folders.map((f) => [f.id, f]));
  for (const n of notes) {
    const f = n.folderId ? byId.get(n.folderId) : undefined;
    if (f) byPath.get(f.name.trim())?.pages.push(n);
  }
  const count = (n: TreeNode): number => (n.total = n.pages.length + n.children.reduce((s, c) => s + count(c), 0));
  roots.forEach(count);
  return roots;
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
const numeral = (i: number) => ROMAN[i] ?? String(i + 1);

export function Contents({
  notes,
  filter,
  onFilter,
  dropProps,
}: {
  notes: NoteSummary[];
  /** The All pages filter: `tree:<path>` selects a part and its sections. */
  filter: string;
  onFilter: (value: string) => void;
  dropProps: (key: string, folderId: string | null) => Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const folders = useApp((s) => s.folders);
  const open = useApp((s) => s.open);
  const pinFolder = useApp((s) => s.pinFolder);
  const createFolder = useApp((s) => s.createFolder);
  const tree = useMemo(() => buildTree(folders, notes), [folders, notes]);
  const unfiled = notes.filter((n) => !n.folderId).length;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState<string | null>(null);

  const toggle = (path: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const row = (n: TreeNode, depth: number, label: string | null) => {
    const isOpen = expanded.has(n.path);
    const hasInside = n.children.length > 0 || n.pages.length > 0;
    const value = `tree:${n.path}`;
    return (
      <li key={n.path} className="toc-item" data-depth={depth}>
        <div className="toc-row" data-active={filter === value} {...(n.folder ? dropProps(`toc-${n.folder.id}`, n.folder.id) : {})}>
          <button
            className="toc-chevron"
            aria-label={isOpen ? t('home.collapse') : t('home.expand')}
            aria-expanded={isOpen}
            disabled={!hasInside}
            onClick={() => toggle(n.path)}
          >
            {hasInside && <ChevronRight size={13} strokeWidth={2} data-open={isOpen} />}
          </button>
          {label && <span className="toc-num">{label}</span>}
          <button
            className="toc-name"
            dir="auto"
            title={n.path}
            onClick={() => {
              onFilter(filter === value ? 'all' : value);
              if (!isOpen && hasInside) toggle(n.path);
            }}
          >
            {n.name}
          </button>
          <span className="toc-leader" aria-hidden="true" />
          <span className="toc-count">{n.total}</span>
          {n.folder && (
            <button
              className="toc-pin"
              aria-pressed={n.folder.pinned}
              aria-label={n.folder.pinned ? t('home.unpinFolder') : t('home.pinFolder')}
              title={n.folder.pinned ? t('home.unpinFolder') : t('home.pinFolder')}
              onClick={() => void pinFolder(n.folder!.id, !n.folder!.pinned)}
            >
              <Pin size={13} strokeWidth={1.75} />
            </button>
          )}
        </div>
        {isOpen && (
          <ul className="toc-list">
            {n.children.map((c) => row(c, depth + 1, null))}
            {n.pages.slice(0, PAGES_SHOWN).map((p) => (
              <li key={p.id} className="toc-page" data-depth={depth + 1}>
                <button className="toc-page-btn" onClick={() => open({ kind: 'page', id: p.id })}>
                  <PageIcon value={p.icon} size={14} className="toc-page-icon" />
                  <span dir="auto" className={p.title ? undefined : 't-muted'}>
                    {p.title || t('page.untitled')}
                  </span>
                </button>
              </li>
            ))}
            {n.pages.length > PAGES_SHOWN && (
              <li className="toc-page" data-depth={depth + 1}>
                <button className="toc-more t-label" onClick={() => onFilter(value)}>
                  {t('home.allInFolder', { count: n.pages.length })}
                </button>
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };

  return (
    <nav className="toc" aria-label={t('home.contents')}>
      <h3 className="t-label toc-head">
        {t('home.contents')}
        <span className="index-count">{String(folders.length).padStart(2, '0')}</span>
      </h3>
      <ul className="toc-list toc-scroll">
        {tree.map((n, i) => row(n, 0, numeral(i)))}
        <li className="toc-item" data-depth={0}>
          <div className="toc-row" data-active={filter === 'none'} {...dropProps('toc-none', null)}>
            <span className="toc-chevron" />
            <span className="toc-num">·</span>
            <button className="toc-name" onClick={() => onFilter(filter === 'none' ? 'all' : 'none')}>
              {t('home.unfiled')}
            </button>
            <span className="toc-leader" aria-hidden="true" />
            <span className="toc-count">{unfiled}</span>
            <span className="toc-pin-space" />
          </div>
        </li>
      </ul>
      {naming !== null ? (
        <input
          className="margin-input"
          autoFocus
          dir="auto"
          value={naming}
          placeholder={t('sidebar.folderName')}
          maxLength={120}
          onChange={(e) => setNaming(e.target.value)}
          onKeyDown={async (e: KeyboardEvent) => {
            if (e.key === 'Escape') setNaming(null);
            if (e.key === 'Enter' && naming.trim()) {
              const f = await createFolder(naming);
              setNaming(null);
              onFilter(`tree:${f.name.trim()}`);
            }
          }}
          onBlur={() => setNaming(null)}
        />
      ) : (
        <button className="toc-new t-label" onClick={() => setNaming('')}>
          + {t('sidebar.newFolder')}
        </button>
      )}
      <p className="toc-hint">{t('home.pinHint')}</p>
    </nav>
  );
}
