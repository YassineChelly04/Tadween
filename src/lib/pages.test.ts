import { describe, expect, it } from 'vitest';
import type { NoteSummary } from './api';
import { ancestors, childrenOf, draggedPages, isTopLevel } from './pages';

const page = (id: string, parentId: string | null = null, trashedAt: number | null = null) => ({ id, parentId, trashedAt }) as NoteSummary;

describe('page tree', () => {
  const notes = [page('a'), page('b', 'a'), page('c', 'b'), page('gone', 'a', 5), page('lost', 'missing')];

  it('lists live children only', () => {
    expect(childrenOf(notes, 'a').map((n) => n.id)).toEqual(['b']);
  });

  it('walks ancestors from the top down', () => {
    expect(ancestors(notes, 'c').map((n) => n.id)).toEqual(['a', 'b']);
    expect(ancestors(notes, 'a')).toEqual([]);
    expect(ancestors(notes, 'lost')).toEqual([]);
  });

  it('survives a loop in the data', () => {
    const loop = [page('x', 'y'), page('y', 'x')];
    expect(ancestors(loop, 'x').map((n) => n.id)).toEqual(['y']);
  });

  it('treats a page whose parent is missing or trashed as top level', () => {
    expect(isTopLevel(notes, notes[0])).toBe(true);
    expect(isTopLevel(notes, notes[1])).toBe(false);
    expect(isTopLevel(notes, notes[4])).toBe(true);
    expect(isTopLevel([page('p', null, 1), page('q', 'p')], page('q', 'p'))).toBe(true);
  });

  it('reads the ids of a drag', () => {
    expect(draggedPages('a,b')).toEqual(['a', 'b']);
    expect(draggedPages('')).toEqual([]);
  });
});
