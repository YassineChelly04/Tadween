import { describe, expect, it } from 'vitest';
import { hijriDate, isoDate, journalStreak, monthGrid, noteDay, onThisDay } from './dates';

describe('dates', () => {
  it('formats local dates', () => {
    expect(isoDate(new Date(2026, 9, 5))).toBe('2026-10-05');
  });

  it('builds a Monday-first month grid', () => {
    const grid = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(grid).toHaveLength(42);
    expect(grid[0].getDay()).toBe(1);
    expect(isoDate(grid[3])).toBe('2026-10-01');
  });

  it('uses the date property before the creation day', () => {
    expect(noteDay({ date: '2026-01-02', createdAt: Date.now() })).toBe('2026-01-02');
    expect(noteDay({ date: null, createdAt: new Date(2026, 4, 9, 23, 30).getTime() })).toBe('2026-05-09');
  });

  it('counts the journal streak, forgiving an unwritten today', () => {
    const today = new Date(2026, 9, 15);
    const days = new Set(['2026-10-14', '2026-10-13', '2026-10-12', '2026-10-10']);
    expect(journalStreak(days, today)).toBe(3);
    days.add('2026-10-15');
    expect(journalStreak(days, today)).toBe(4);
    expect(journalStreak(new Set(), today)).toBe(0);
  });
});

describe('onThisDay', () => {
  const entry = (date: string, preview = 'A line.', journal = true) =>
    ({ id: date, title: '', preview, folderId: null, parentId: null, pinned: false, date, journal, icon: null, trashedAt: null, createdAt: 0, updatedAt: 0, words: 2 }) as const;

  it('prefers the oldest memory', () => {
    const notes = [entry('2026-10-29'), entry('2026-10-05'), entry('2025-11-05')];
    expect(onThisDay(notes, '2026-11-05')).toMatchObject({ ago: 'year', day: '2025-11-05' });
  });

  it('falls back to a month and then a week', () => {
    expect(onThisDay([entry('2026-10-05')], '2026-11-05')?.ago).toBe('month');
    expect(onThisDay([entry('2026-10-29')], '2026-11-05')?.ago).toBe('week');
  });

  it('skips empty entries, ordinary pages and other days', () => {
    expect(onThisDay([entry('2026-10-29', '  '), entry('2026-10-05', 'A page.', false), entry('2026-10-28')], '2026-11-05')).toBeNull();
  });
});

describe('hijriDate', () => {
  it('names the Hijri year', () => {
    expect(hijriDate(new Date(2026, 10, 5), 'en')).toMatch(/144[78]/);
  });
});
