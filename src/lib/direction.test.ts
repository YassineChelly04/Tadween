import { describe, expect, it } from 'vitest';
import { detectDir, layoutDir } from './direction';
import { checkPassword } from './password';

describe('detectDir', () => {
  it('uses the first strong character', () => {
    expect(detectDir('مرحبا world')).toBe('rtl');
    expect(detectDir('Hello مرحبا')).toBe('ltr');
    expect(detectDir('  123 - كتاب')).toBe('rtl');
    expect(detectDir('Élève')).toBe('ltr');
  });

  it('returns null without letters', () => {
    expect(detectDir('')).toBeNull();
    expect(detectDir('42 / 7 !')).toBeNull();
  });
});

describe('checkPassword (mirror of the Rust rule)', () => {
  it.each([
    ['short1A', false],
    ['aaaaaaaaaaaaaaaaaaaa', false],
    ['lowercase', false],
    ['tadween26', true],
    ['alllowercaseword', true],
    ['كلمةسر2026', true],
    ['كلمةسرية', false],
  ])('%s -> %s', (pw, ok) => {
    expect(checkPassword(pw).ok).toBe(ok);
  });
});

describe('layoutDir', () => {
  it('runs the app right to left in Arabic only', () => {
    expect(layoutDir('ar', 'unlocked')).toBe('rtl');
    expect(layoutDir('ar', 'onboarding')).toBe('rtl');
    expect(layoutDir('fr', 'unlocked')).toBe('ltr');
    expect(layoutDir('en', 'unlocked')).toBe('ltr');
  });

  it('keeps the login screen as it is, even in Arabic', () => {
    expect(layoutDir('ar', 'locked')).toBe('ltr');
  });
});
