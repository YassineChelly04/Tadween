// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApp } from '../../store';
import type { NoteSummary } from '../../lib/api';
import { Home, momentAt } from './Home';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const page = (over: Partial<NoteSummary>): NoteSummary => ({ id: 'a', title: 'Cours', preview: '', folderId: null, parentId: null, pinned: false, date: null, journal: false, icon: null, trashedAt: null, createdAt: 0, updatedAt: Date.now(), words: 1, ...over });

describe('momentAt', () => {
  it('follows the hour', () => {
    expect([2, 9, 14, 20, 23].map((h) => momentAt(h, 0))).toEqual(['night', 'morning', 'afternoon', 'evening', 'night']);
  });

  it('welcomes you back after a few days, at any hour', () => {
    expect(momentAt(2, 3)).toBe('away');
    expect(momentAt(14, 2.9)).toBe('afternoon');
  });
});

describe('Home', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 5, 19, 41));
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    useApp.setState({ notes: [page({})], displayName: 'Yassine' });
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root.render(<Home />));
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('says hello by name and shows the time', () => {
    expect(host.querySelector('h1')?.textContent).toBe('Good evening, Yassine');
    expect(host.querySelector('.clock-digits')?.textContent).toMatch(/0?7:41|19:41/);
    expect(host.querySelector('.home')?.getAttribute('data-sky')).toBe('dusk');
  });

  it('keeps the clock running', () => {
    act(() => void vi.advanceTimersByTime(60_000));
    expect(host.querySelector('.clock-digits')?.textContent).toMatch(/0?7:42|19:42/);
  });

  it('lets one of the cast speak when clicked', () => {
    act(() => host.querySelector('.home-cast')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(host.querySelector('.home-say')?.textContent).toContain('Qalam');
  });
});
