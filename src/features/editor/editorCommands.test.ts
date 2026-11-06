// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { Editor } from '@tiptap/core';
import { createExtensions } from './extensions';

// A command that no extension provides is undefined at run time, and TipTap's
// types do not always catch it: a call like that once crashed the block menu.
const sources = import.meta.glob('../../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('editor commands', () => {
  it('every command the app calls exists', () => {
    const editor = new Editor({ extensions: createExtensions('ltr') });
    const known = new Set(Object.keys(editor.commands));
    const missing: string[] = [];
    for (const [file, text] of Object.entries(sources)) {
      if (file.endsWith('.test.ts')) continue;
      for (const [, name] of text.matchAll(/\bcommands\.(\w+)\(/g)) {
        if (!known.has(name)) missing.push(`${file}: ${name}`);
      }
      // Each link of a chain: .chain().focus().insertColumns(2).run()
      for (const [chain] of text.matchAll(/\.chain\(\)(?:\s*\.\w+\((?:[^()]|\([^()]*\))*\))+/g)) {
        for (const [, name] of chain.matchAll(/(?:^|\))\s*\.(\w+)\(/g)) {
          if (name !== 'run' && name !== 'chain' && !known.has(name)) missing.push(`${file}: ${name}`);
        }
      }
    }
    editor.destroy();
    expect(missing).toEqual([]);
  });
});
