import { describe, expect, it, vi } from 'vitest';
import type { JSONContent } from '@tiptap/core';

// The editor's React node views are not needed to build the schema.
vi.mock('../features/editor/pdf', async () => {
  const { Node } = await import('@tiptap/core');
  return {
    Pdf: Node.create({
      name: 'pdf',
      group: 'block',
      atom: true,
      addAttributes: () => ({ attachmentId: { default: '', parseHTML: (el: HTMLElement) => el.getAttribute('data-attachment-id') } }),
      parseHTML: () => [{ tag: 'div[data-pdf]' }],
      renderHTML: () => ['div', { 'data-pdf': '' }],
    }),
  };
});

const { fromBackup, noteFromFile, notesFromSheet, toMarkdown } = await import('./transfer');
import type { ImportFile } from './api';

const text = (path: string, body: string): ImportFile => ({ path, kind: 'text', text: body, dataUrl: null, attachmentId: null, sheets: null, size: body.length });
const types = (doc: JSONContent): string[] => (doc.content ?? []).map((n) => n.type ?? '');

describe('import', () => {
  const png: ImportFile = { path: 'Vault/assets/pic.png', kind: 'image', text: null, dataUrl: 'data:image/png;base64,AAAA', attachmentId: null, sheets: null, size: 3 };
  const pdf: ImportFile = { path: 'Vault/files/report.pdf', kind: 'pdf', text: null, dataUrl: null, attachmentId: 'att-1', sheets: null, size: 10 };
  const lookup = {
    byPath: new Map([png, pdf].map((f) => [f.path.toLowerCase(), f])),
    byName: new Map([png, pdf].map((f) => [f.path.split('/').pop()!.toLowerCase(), f])),
  };

  it('reads an Obsidian daily note with front matter, embeds, tasks and callouts', () => {
    const md = [
      '---',
      'tags: [daily]',
      'created: 2026-10-14T08:00:00Z',
      '---',
      'Morning pages with [[Ideas|my ideas]] and ==important== words.',
      '',
      '![[pic.png]]',
      '',
      '![[report.pdf]]',
      '',
      '- [x] Done',
      '- [ ] Todo',
      '',
      '> [!note] Remember',
      '> Drink water',
    ].join('\n');
    const n = noteFromFile(text('Vault/Daily/2026-10-14.md', md), 'Vault', lookup)!;
    expect(n.title).toBe('2026-10-14');
    expect(n.folder).toBe('Daily');
    expect(n.date).toBe('2026-10-14');
    expect(n.journal).toBe(true);
    expect(n.createdAt).toBe(Date.parse('2026-10-14T08:00:00Z'));
    expect(n.text).toContain('my ideas');
    expect(n.text).not.toContain('[[');
    const t = types(n.content);
    expect(t).toContain('image');
    expect(t).toContain('pdf');
    expect(t).toContain('taskList');
    expect(t).toContain('callout');
  });

  it('cleans Notion export names and repeated titles', () => {
    const md = '# Project plan\n\nA paragraph.\n\n| A | B |\n| - | - |\n| 1 | 2 |\n';
    const n = noteFromFile(text('Export/Work 1f2e3d4c5b6a79881f2e3d4c5b6a7988/Project plan 0123456789abcdef0123456789abcdef.md', md), 'Export', lookup)!;
    expect(n.title).toBe('Project plan');
    expect(n.folder).toBe('Work');
    expect(types(n.content)).toEqual(['paragraph', 'table']);
  });

  it('drops remote images so the app stays offline', () => {
    const n = noteFromFile(text('a.md', '![x](https://example.com/x.png)\n\ntext'), '', lookup)!;
    expect(JSON.stringify(n.content)).not.toContain('example.com');
  });
});

describe('export', () => {
  it('writes Markdown with marks, lists, tables and assets', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }, { type: 'text', text: ' and ' }, { type: 'text', text: 'link', marks: [{ type: 'link', attrs: { href: 'https://x.y' } }] }] },
        { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'done' }] }] }] },
        { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'H' }] }] }] }, { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'v' }] }] }] }] },
        { type: 'image', attrs: { src: 'data:image/png;base64,AAAA' } },
      ],
    };
    const assets = { entries: [], used: new Set<string>(), images: new Map<string, string>() };
    const md = toMarkdown(doc, assets, '');
    expect(md).toContain('## Title');
    expect(md).toContain('**bold** and [link](https://x.y)');
    expect(md).toContain('- [x] done');
    expect(md).toContain('| H |');
    expect(md).toContain('![](assets/image-1.png)');
    expect(assets.entries).toHaveLength(1);
  });
});

describe('spreadsheets', () => {
  it('a Notion database CSV becomes a table page in its folder', () => {
    const csv = text('Export/Work 1f2e3d4c5b6a79881f2e3d4c5b6a7988/Tasks 0a1b2c3d4e5f60718293a4b5c6d7e8f9_all.csv', 'Name,Status\nWrite report,Done\n');
    const [note] = notesFromSheet(csv, 'Export');
    expect(note.title).toBe('Tasks');
    expect(note.folder).toBe('Work');
    expect(types(note.content)[0]).toBe('table');
  });

  it('a workbook with two sheets gives two pages', () => {
    const book = { path: 'Budget.xlsx', kind: 'sheet' as const, text: null, dataUrl: null, attachmentId: null, size: 1, sheets: [
      { name: 'Jan', rows: [['Item', 'Cost'], ['Rent', '500']] },
      { name: 'Feb', rows: [['Item', 'Cost'], ['Rent', '500']] },
    ] };
    expect(notesFromSheet(book, '').map((n) => n.title)).toEqual(['Budget · Jan', 'Budget · Feb']);
  });
});

describe('backups', () => {
  const doc = (pageId: string) => ({ type: 'doc', content: [{ type: 'pageLink', attrs: { pageId } }] });
  const note = (id: string, parentId: string | null, content: JSONContent) => ({
    id,
    parentId,
    title: id,
    content,
    text: '',
    folderId: 'f',
    pinned: true,
    date: null,
    journal: false,
    icon: 'leaf:ember',
    trashedAt: null,
    createdAt: 1,
    updatedAt: 2,
  });
  const backup = JSON.stringify({
    format: 'tadween',
    folders: [{ id: 'f', name: 'Work', createdAt: 1, pinned: true }],
    notes: [note('top', null, doc('child')), note('child', 'top', { type: 'doc', content: [] })],
  });

  it('keep sub-pages, the links to them, icons and folders, under fresh ids', () => {
    const { notes, folders } = fromBackup(backup, []);
    const [top, child] = notes;
    expect(top.id).not.toBe('top');
    expect(child.parentId).toBe(top.id);
    expect(top.content.content![0].attrs!.pageId).toBe(child.id);
    expect(top.icon).toBe('leaf:ember');
    expect(top.folder).toBe('Work');
    expect(folders[0].pinned).toBe(true);
  });

  it('can be restored twice without the copies mixing', () => {
    expect(fromBackup(backup, []).notes[0].id).not.toBe(fromBackup(backup, []).notes[0].id);
  });
});

describe('sub-pages in Markdown', () => {
  it('become wiki links with the page title', () => {
    const assets = { entries: [], used: new Set<string>(), images: new Map<string, string>(), titles: new Map([['p1', 'Plans']]) };
    expect(toMarkdown({ type: 'doc', content: [{ type: 'pageLink', attrs: { pageId: 'p1' } }] }, assets)).toBe('[[Plans]]\n');
  });
});
