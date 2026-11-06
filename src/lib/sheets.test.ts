import { describe, expect, it } from 'vitest';
import { cleanNotionCell, MAX_CELLS, parseCsv, sheetDocs } from './sheets';

describe('parseCsv', () => {
  it('handles quotes, doubled quotes and newlines inside quotes', () => {
    expect(parseCsv('Name,Note\r\n"Smith, J","said ""hi""\nthen left"\r\n')).toEqual([
      ['Name', 'Note'],
      ['Smith, J', 'said "hi"\nthen left'],
    ]);
  });

  it('detects semicolons (French Excel) and tabs', () => {
    expect(parseCsv('a;b;c\n1;2,5;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2,5', '3'],
    ]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('drops empty rows and trailing empty cells', () => {
    expect(parseCsv('a,b,,\n,,\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('Notion cells', () => {
  it('keeps the title of a relation', () => {
    expect(cleanNotionCell('Amen Allah (../People/Amen%20Allah%201f2e3d.md)')).toBe('Amen Allah');
    expect(cleanNotionCell('Plain text (with brackets)')).toBe('Plain text (with brackets)');
  });
});

describe('sheetDocs', () => {
  it('makes one table with a header row', () => {
    const [doc] = sheetDocs([
      ['Name', 'Status'],
      ['A', 'Done'],
    ]);
    const table = doc.content.content![0];
    expect(table.type).toBe('table');
    expect(table.content![0].content![0].type).toBe('tableHeader');
    expect(table.content![1].content![1].content![0].content![0].text).toBe('Done');
  });

  it('pads short rows to the widest row', () => {
    const [doc] = sheetDocs([['a', 'b', 'c'], ['1']]);
    expect(doc.content.content![0].content![1].content).toHaveLength(3);
  });

  it('splits very large sheets and repeats the header', () => {
    const width = 10;
    const rows = [Array.from({ length: width }, (_, i) => `h${i}`), ...Array.from({ length: 3000 }, (_, r) => Array.from({ length: width }, (_, c) => `${r}:${c}`))];
    const docs = sheetDocs(rows);
    expect(docs.length).toBeGreaterThan(1);
    let body = 0;
    for (const d of docs) {
      const table = d.content.content![0];
      expect(table.content!.length * width).toBeLessThanOrEqual(MAX_CELLS);
      expect(table.content![0].content![0].content![0].content![0].text).toBe('h0');
      body += table.content!.length - 1;
    }
    expect(body).toBe(3000);
  });
});
