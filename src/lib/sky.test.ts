import { describe, expect, it } from 'vitest';
import { bodyAt, moonPath, moonPhase, skyAt } from './sky';

const HORIZON = 590;

describe('sky', () => {
  it('follows the hour', () => {
    expect([4, 6, 12, 18, 21].map(skyAt)).toEqual(['night', 'dawn', 'day', 'dusk', 'night']);
  });

  it('keeps the sun moving east to west and under the words', () => {
    const noon = bodyAt(12.5, HORIZON);
    expect(noon).toMatchObject({ kind: 'sun', x: 885, y: 540 });
    expect(bodyAt(7, HORIZON).x).toBeLessThan(bodyAt(17, HORIZON).x);
  });

  it('rises and sets below the horizon', () => {
    expect(bodyAt(6, HORIZON).y).toBeGreaterThan(HORIZON);
    expect(bodyAt(18.99, HORIZON).y).toBeGreaterThan(HORIZON - 30);
  });

  it('brings the moon out from dusk until morning', () => {
    expect(bodyAt(19, HORIZON).kind).toBe('moon');
    expect(bodyAt(0.5, HORIZON).kind).toBe('moon');
    expect(bodyAt(5.9, HORIZON).kind).toBe('moon');
    expect(bodyAt(0.5, HORIZON).x).toBe(885);
  });

  it('knows real moon phases', () => {
    // A full moon on 2024-02-24 and a new moon on 2024-04-08, both about 12:00 to 18:00 UTC.
    expect(Math.abs(moonPhase(new Date('2024-02-24T12:30:00Z')) - 0.5)).toBeLessThan(0.02);
    const nearNew = moonPhase(new Date('2024-04-08T18:21:00Z'));
    expect(Math.min(nearNew, 1 - nearNew)).toBeLessThan(0.02);
  });

  it('draws a closed moon at any phase', () => {
    for (const phase of [0.05, 0.25, 0.5, 0.75, 0.95]) expect(moonPath(100, 100, 30, phase)).toMatch(/^M100 70A.*z$/);
  });
});
