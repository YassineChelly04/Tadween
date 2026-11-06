// Mirrors `password_is_strong` in src-tauri/src/text.rs. The Rust core is the
// authority; this copy only drives the live feedback in the UI.

export interface PasswordCheck {
  length: boolean;
  variety: boolean;
  notRepeated: boolean;
  /** 0 (empty) to 4 (excellent). */
  score: 0 | 1 | 2 | 3 | 4;
  ok: boolean;
}

// Same list as COMMON_PASSWORDS in src-tauri/src/text.rs.
const COMMON = new Set([
  'password', 'password1', 'password12', 'password123', 'motdepasse', 'motdepasse1', 'azertyuiop', 'azerty123', 'azerty1234', 'qwertyuiop', 'qwerty123', 'qwerty1234', '12345678', '123456789', '1234567890', '0123456789', 'iloveyou', 'iloveyou1', 'admin123', 'admin1234', 'admin12345', 'letmein123', 'tadween1', 'tadween123', 'abc12345', 'abcd1234',
]);

function classes(password: string): number {
  const chars = [...password];
  const isLetter = (c: string) => /\p{L}/u.test(c);
  return [
    chars.some((c) => c !== c.toUpperCase() && c === c.toLowerCase()),
    chars.some((c) => c !== c.toLowerCase() && c === c.toUpperCase()),
    chars.some((c) => /\p{N}/u.test(c)),
    chars.some((c) => !/[\p{L}\p{N}]/u.test(c)),
    chars.some((c) => isLetter(c) && c.toLowerCase() === c.toUpperCase()),
  ].filter(Boolean).length;
}

export function checkPassword(password: string): PasswordCheck {
  const chars = [...password];
  const len = chars.length;
  const notRepeated = len > 0 && !chars.every((c) => c === chars[0]);
  const variety = len >= 12 || classes(password) >= 2;
  const length = len >= 8;
  const ok = length && variety && notRepeated;

  let score: PasswordCheck['score'] = 0;
  if (len > 0) score = 1;
  if (ok) score = 2;
  if (ok && (len >= 12 || (len >= 10 && classes(password) >= 3))) score = 3;
  if (ok && (len >= 16 || (len >= 12 && classes(password) >= 3))) score = 4;
  if (COMMON.has(password.toLowerCase())) score = 1;

  return { length, variety, notRepeated, score, ok: ok && !COMMON.has(password.toLowerCase()) };
}
