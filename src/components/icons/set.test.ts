import { describe, expect, it } from 'vitest';
import { ICONS, parseIcon } from './set';

// Pages store `name:colour`, so a name that disappears loses that page's icon.
const SHIPPED_BEFORE_THE_STAMPS =
  'page journal pen bookmark quote list checklist tag idea question target compass flag star heart spark anchor layers briefcase folder calendar clock chart diagram table code gear receipt home leaf sun moon coffee music camera plane pin gift graduation flask globe calculator language person people chat mail coins wallet key'.split(' ');

describe('icon set', () => {
  it('has more than 100 icons with unique names', () => {
    expect(ICONS.length).toBeGreaterThan(100);
    expect(new Set(ICONS.map((i) => i.id)).size).toBe(ICONS.length);
  });

  it('keeps every name pages may already use', () => {
    for (const id of SHIPPED_BEFORE_THE_STAMPS) expect(parseIcon(`${id}:lapis`)?.def.id).toBe(id);
  });

  it('draws something and places the dot on the grid', () => {
    for (const i of ICONS) {
      expect(i.shape || i.line, i.id).toBeTruthy();
      const [x, y, r] = i.dot;
      expect(x - r, i.id).toBeGreaterThanOrEqual(0);
      expect(y - r, i.id).toBeGreaterThanOrEqual(0);
      expect(x + r, i.id).toBeLessThanOrEqual(24);
      expect(y + r, i.id).toBeLessThanOrEqual(24);
    }
  });

  it('uses only valid path data', () => {
    const path = /^[MmLlHhVvCcSsQqTtAaZz0-9 .,-]+$/;
    for (const i of ICONS) {
      for (const d of [i.shape, i.line, i.hole, i.cut]) if (d) expect(d, i.id).toMatch(path);
    }
  });

  it('can be found in English and Arabic', () => {
    for (const i of ICONS) {
      expect(i.words, i.id).toMatch(/[a-z]/i);
      expect(i.words, i.id).toMatch(/[؀-ۿ]/);
    }
  });
});
