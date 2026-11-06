// Spreadsheets (CSV, TSV, and workbooks read by the Rust core) become pages
// holding a table. Notion exports every database as a CSV next to a folder of
// its row pages, so this is also how Notion databases come in.

import type { JSONContent } from '@tiptap/core';

/** Cells per page. Past this a table makes the editor slow, so it is split. */
export const MAX_CELLS = 12_000;

/** RFC 4180 CSV: quoted fields, doubled quotes, newlines inside quotes. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const sep = delimiter ?? guessDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return trim(rows);
}

/** Comma unless the first line clearly uses semicolons (French Excel) or tabs. */
function guessDelimiter(text: string): string {
  const end = text.search(/\r?\n/);
  const first = end < 0 ? text : text.slice(0, end);
  const count = (ch: string) => first.split(ch).length - 1;
  const [tab, semi, comma] = [count('\t'), count(';'), count(',')];
  if (tab > comma && tab >= semi) return '\t';
  if (semi > comma) return ';';
  return ',';
}

/** Drops empty trailing rows and columns. */
function trim(rows: string[][]): string[][] {
  const out = rows.filter((r) => r.some((c) => c.trim() !== ''));
  return out.map((r) => {
    const copy = [...r];
    while (copy.length && copy[copy.length - 1].trim() === '') copy.pop();
    return copy;
  });
}

/** Notion writes relations as "Title (Title%20abc….md)"; keep the title. */
export function cleanNotionCell(cell: string): string {
  return cell.replace(/\s*\((?:[^()]*%20)?[^()]*\.(?:md|html|csv)\)/g, '').trim();
}

function cell(text: string, header: boolean): JSONContent {
  return {
    type: header ? 'tableHeader' : 'tableCell',
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' }],
  };
}

/** One table document: the first row is the header. */
function tableDoc(header: string[], body: string[][], width: number): JSONContent {
  const row = (r: string[], isHeader: boolean): JSONContent => ({
    type: 'tableRow',
    content: Array.from({ length: width }, (_, i) => cell((r[i] ?? '').replace(/\r?\n/g, ' ').trim(), isHeader)),
  });
  return { type: 'doc', content: [{ type: 'table', content: [row(header, true), ...body.map((r) => row(r, false))] }, { type: 'paragraph' }] };
}

/** Rows → one or more documents of at most MAX_CELLS cells, each repeating the header. */
export function sheetDocs(rows: string[][]): { content: JSONContent; text: string }[] {
  if (!rows.length) return [];
  const width = Math.max(1, ...rows.map((r) => r.length));
  const [header, ...body] = rows;
  const per = Math.max(1, Math.floor(MAX_CELLS / width) - 1);
  const out: { content: JSONContent; text: string }[] = [];
  for (let i = 0; i === 0 || i < body.length; i += per) {
    const part = body.slice(i, i + per);
    out.push({
      content: tableDoc(header, part, width),
      text: [header, ...part].map((r) => r.join(' · ')).join('\n'),
    });
  }
  return out;
}
