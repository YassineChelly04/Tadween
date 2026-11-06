import type { NoteSummary } from './api';

/** Drag data for pages: comma-separated ids. */
export const PAGE_MIME = 'application/x-tadween-page';

export const draggedPages = (raw: string): string[] => raw.split(',').filter(Boolean);

/** The live sub-pages of `id`. */
export function childrenOf(notes: NoteSummary[], id: string): NoteSummary[] {
  return notes.filter((n) => n.parentId === id && !n.trashedAt);
}

/** The pages around `id`, outermost first. Stops at a missing page or a loop. */
export function ancestors(notes: NoteSummary[], id: string): NoteSummary[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  const out: NoteSummary[] = [];
  const seen = new Set([id]);
  let at = byId.get(id)?.parentId ?? null;
  while (at && !seen.has(at)) {
    const parent = byId.get(at);
    if (!parent) break;
    seen.add(at);
    out.unshift(parent);
    at = parent.parentId;
  }
  return out;
}

/** True when the page stands on its own: it is not inside another live page. */
export function isTopLevel(notes: NoteSummary[], n: NoteSummary): boolean {
  if (!n.parentId) return true;
  const parent = notes.find((p) => p.id === n.parentId);
  return !parent || !!parent.trashedAt;
}

/** Most recently edited first. */
export const byEdited = (a: NoteSummary, b: NoteSummary) => b.updatedAt - a.updatedAt;
