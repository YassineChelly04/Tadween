import rust from '../../../src-tauri/src/accounts.rs?raw';
import { describe, expect, it } from 'vitest';
import { lookOf } from '../../lib/look';
import { BACKDROPS, PALETTES, backdropOf } from './Backdrop';

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('login backgrounds', () => {
  it('has eight, each drawn for every look', () => {
    expect(BACKDROPS).toHaveLength(8);
    for (const id of BACKDROPS) expect(Object.keys(PALETTES[id]).sort()).toEqual(['day', 'light', 'night']);
  });

  it('keeps the wordmark and the hint readable on every ground', () => {
    const muted = { day: '#5A5651', light: '#5E574F', night: '#ABA399' };
    for (const id of BACKDROPS) {
      for (const look of ['day', 'light', 'night'] as const) {
        expect(contrast(PALETTES[id][look].ground, muted[look]), `${id} ${look}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('never lets Waraqa or Qalam melt into the ground', () => {
    const paper = { day: '#FBF8F2', light: '#FBF8F2', night: '#F4EFE6' };
    const lapis = { day: '#1F2F7A', light: '#1F2F7A', night: '#3D56C8' };
    for (const id of BACKDROPS) {
      for (const look of ['day', 'light', 'night'] as const) {
        const { ground } = PALETTES[id][look];
        expect(contrast(ground, lapis[look]), `${id} ${look}`).toBeGreaterThanOrEqual(1.9);
        if (look === 'night') expect(contrast(ground, paper[look]), `${id} ${look}`).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it('falls back to the mark for anything it does not know', () => {
    expect(backdropOf('door')).toBe('door');
    expect(backdropOf('gone')).toBe('mark');
    expect(backdropOf(undefined)).toBe('mark');
  });

  it('matches the list the Rust core accepts', () => {
    for (const id of BACKDROPS) expect(rust).toContain(`"${id}"`);
  });
});

describe('lookOf', () => {
  it('follows Windows only when the theme is automatic', () => {
    expect(lookOf('day', true)).toBe('day');
    expect(lookOf('light', true)).toBe('light');
    expect(lookOf('dark', false)).toBe('night');
    expect(lookOf('system', true)).toBe('night');
    expect(lookOf('system', false)).toBe('light');
  });
});
