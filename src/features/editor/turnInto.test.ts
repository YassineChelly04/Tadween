// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import { createExtensions } from './extensions';
import { turnInto, type TurnTarget } from './turnInto';

// The to-do list from the bug report: items with nested to-dos.
const NESTED = `<ul data-type="taskList">
<li data-type="taskItem" data-checked="false"><p>Concp</p><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>1 chap</p></li></ul></li>
<li data-type="taskItem" data-checked="false"><p>Création</p></li>
<li data-type="taskItem" data-checked="false"><p>Supply</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>chap0</p></li><li data-type="taskItem" data-checked="false"><p>chap1</p></li></ul></li>
<li data-type="taskItem" data-checked="false"><p>Sys info</p></li></ul>`;

const TEXTS = ['Concp', '1 chap', 'Création', 'Supply', 'chap0', 'chap1', 'Sys info'];

let editor: Editor;
afterEach(() => editor?.destroy());

function make(html: string) {
  editor = new Editor({ extensions: createExtensions('ltr'), content: html });
  return editor;
}

/** Selects from the start of the block containing `a` to the end of the one containing `b`. */
function select(a: string, b: string) {
  let from = -1;
  let to = -1;
  editor.state.doc.descendants((n, pos) => {
    if (!n.isTextblock) return true;
    if (n.textContent === a && from < 0) from = pos + 1;
    if (n.textContent === b) to = pos + 1 + n.content.size;
    return false;
  });
  editor.commands.setTextSelection({ from, to });
}

/** Top-level block types, without the empty paragraph the editor keeps last. */
const types = (doc: JSONContent) => {
  const blocks = doc.content ?? [];
  const last = blocks[blocks.length - 1];
  return (last?.type === 'paragraph' && !last.content ? blocks.slice(0, -1) : blocks).map((n) => n.type);
};
const texts = () => {
  const out: string[] = [];
  editor.state.doc.descendants((n) => {
    if (n.isTextblock) out.push(n.textContent);
    return !n.isTextblock;
  });
  return out.filter(Boolean);
};

describe('turnInto on nested to-do lists', () => {
  for (const target of ['text', 'h1', 'h2', 'h3', 'code', 'bullet', 'numbered', 'quote', 'callout'] as TurnTarget[]) {
    it(`whole list → ${target} keeps every line, in order`, () => {
      make(NESTED);
      editor.commands.selectAll();
      expect(turnInto(editor, target)).toBe(true);
      expect(texts()).toEqual(TEXTS);
      expect(editor.state.doc.check()).toBeUndefined();
    });
  }

  it('whole list → text gives seven paragraphs', () => {
    make(NESTED);
    editor.commands.selectAll();
    turnInto(editor, 'text');
    expect(types(editor.getJSON())).toEqual(Array(7).fill('paragraph'));
  });

  it('to-do → bullet keeps the nesting', () => {
    make(NESTED);
    editor.commands.selectAll();
    turnInto(editor, 'bullet');
    const list = editor.getJSON().content![0] as JSONContent;
    expect(list.type).toBe('bulletList');
    expect(list.content).toHaveLength(4);
    expect(list.content![0].content![1].type).toBe('bulletList');
  });

  it('to-do again on a to-do list turns it into text', () => {
    make(NESTED);
    editor.commands.selectAll();
    turnInto(editor, 'todo');
    expect(types(editor.getJSON())).toEqual(Array(7).fill('paragraph'));
  });

  it('two items → heading splits the list around them', () => {
    make(NESTED);
    select('Création', 'Supply');
    turnInto(editor, 'h2');
    expect(types(editor.getJSON())).toEqual(['taskList', 'heading', 'heading', 'taskList']);
    expect(texts()).toEqual(TEXTS);
    // The untouched first item keeps its checked child.
    const first = editor.getJSON().content![0] as JSONContent;
    expect(first.content![0].content![1].content![0].attrs!.checked).toBe(true);
  });

  it('paragraphs → to-do', () => {
    make('<p>a</p><p>b</p><h2>c</h2>');
    editor.commands.selectAll();
    turnInto(editor, 'todo');
    expect(types(editor.getJSON())).toEqual(['taskList']);
    expect(texts()).toEqual(['a', 'b', 'c']);
  });

  it('a cursor in a single paragraph → heading', () => {
    make('<p>one</p><p>two</p>');
    editor.commands.setTextSelection(2);
    turnInto(editor, 'h1');
    expect(types(editor.getJSON())).toEqual(['heading', 'paragraph']);
  });

  it('a code block becomes text with its lines kept', () => {
    make('<pre><code>one\ntwo</code></pre>');
    editor.commands.setTextSelection(2);
    turnInto(editor, 'text');
    const para = editor.getJSON().content![0] as JSONContent;
    expect(para.content!.map((n) => n.type)).toEqual(['text', 'hardBreak', 'text']);
  });

  it('quote toggles off', () => {
    make('<p>one</p>');
    editor.commands.selectAll();
    turnInto(editor, 'quote');
    expect(types(editor.getJSON())).toEqual(['blockquote']);
    turnInto(editor, 'quote');
    expect(types(editor.getJSON())).toEqual(['paragraph']);
  });
});

describe('turnInto across containers', () => {
  const TABLE = '<table><tr><td><p>a</p></td><td><p>b</p></td></tr><tr><td><p>c</p></td><td><p>d</p></td></tr></table><p></p>';
  const COLUMNS = '<div data-columns data-count="2"><div data-column><p>left</p></div><div data-column><p>right</p></div></div>';
  const inside = (type: string) => {
    let n = 0;
    editor.state.doc.descendants((node) => void (node.type.name === type && n++));
    return n;
  };

  for (const target of ['h2', 'quote', 'callout', 'bullet', 'toggle'] as TurnTarget[]) {
    it(`text selected across table cells → ${target}, cell by cell`, () => {
      make(TABLE);
      select('a', 'd');
      expect(turnInto(editor, target)).toBe(true);
      expect(texts()).toEqual(['a', 'b', 'c', 'd']);
      expect(inside('table')).toBe(1);
      expect(inside('tableCell') + inside('tableHeader')).toBe(4);
      expect(editor.state.doc.check()).toBeUndefined();
    });
  }

  it('text selected across columns keeps the columns', () => {
    make(COLUMNS);
    select('left', 'right');
    expect(turnInto(editor, 'h1')).toBe(true);
    expect(inside('column')).toBe(2);
    expect(inside('heading')).toBe(2);
  });
});

describe('turnInto on quotes, callouts and toggles', () => {
  const grip = (pos = 0) => editor.commands.setNodeSelection(pos);

  it('the grip turns a whole quote into text', () => {
    make('<blockquote><p>a</p><p>b</p></blockquote>');
    grip();
    turnInto(editor, 'text');
    expect(types(editor.getJSON())).toEqual(['paragraph', 'paragraph']);
  });

  it('the grip on a quote toggles it instead of nesting it', () => {
    make('<blockquote><p>a</p></blockquote>');
    grip();
    turnInto(editor, 'quote');
    expect(types(editor.getJSON())).toEqual(['paragraph']);
  });

  it('a callout becomes a quote, not a quote in a callout', () => {
    make('<div data-callout><p>a</p></div>');
    grip();
    turnInto(editor, 'quote');
    expect(types(editor.getJSON())).toEqual(['blockquote']);
  });

  it('one line of a quote leaves it; the others stay quoted', () => {
    make('<blockquote><p>a</p><p>b</p><p>c</p></blockquote>');
    select('b', 'b');
    turnInto(editor, 'h2');
    expect(types(editor.getJSON())).toEqual(['blockquote', 'heading', 'blockquote']);
    expect(texts()).toEqual(['a', 'b', 'c']);
  });

  it('a list inside a quote can leave it', () => {
    make('<blockquote><ul><li><p>a</p></li><li><p>b</p></li></ul></blockquote>');
    select('a', 'b');
    expect(turnInto(editor, 'quote')).toBe(true);
    expect(types(editor.getJSON())).toEqual(['bulletList']);
  });

  it('a heading stays inside its callout', () => {
    make('<div data-callout><p>a</p></div>');
    select('a', 'a');
    turnInto(editor, 'h2');
    expect(types(editor.getJSON())).toEqual(['callout']);
    expect((editor.getJSON().content![0] as JSONContent).content![0].type).toBe('heading');
  });

  it('lines become a toggle titled by the first, and back', () => {
    make('<p>title</p><p>body</p>');
    editor.commands.selectAll();
    turnInto(editor, 'toggle');
    expect(types(editor.getJSON())).toEqual(['details']);
    expect(texts()).toEqual(['title', 'body']);
    editor.commands.setTextSelection(3);
    turnInto(editor, 'toggle');
    expect(types(editor.getJSON())).toEqual(['paragraph', 'paragraph']);
  });

  it('nested to-dos become a toggle without throwing', () => {
    make(NESTED);
    editor.commands.selectAll();
    expect(turnInto(editor, 'toggle')).toBe(true);
    expect(texts()).toEqual(TEXTS);
    expect(editor.state.doc.check()).toBeUndefined();
  });
});

// Every kind of block against every target, from a caret and from the grip:
// nothing may throw, refuse, or lose a word.
describe('turnInto sweep', () => {
  const DOCS = [
    '<h1>t</h1><p>p <strong>b</strong></p><ul><li><p>a</p><ul><li><p>n</p></li></ul></li></ul><blockquote><p>q</p><p>r</p></blockquote><div data-callout><p>c</p><ul><li><p>l</p></li></ul></div><pre><code>x\ny</code></pre><p>e</p>',
    '<p>x</p><table><tr><th><p>h</p></th><th><p>i</p></th></tr><tr><td><blockquote><p>q</p></blockquote></td><td><ul><li><p>y</p></li></ul></td></tr></table>',
    '<div data-columns data-count="2"><div data-column><p>l</p><p>m</p></div><div data-column><ul><li><p>r</p></li></ul></div></div><details class="toggle" open><summary>s</summary><div data-type="detailsContent"><p>i</p></div></details>',
  ];
  const ALL: TurnTarget[] = ['text', 'h1', 'h2', 'h3', 'code', 'bullet', 'numbered', 'todo', 'quote', 'callout', 'toggle'];
  const squeeze = (s: string) => s.replace(/\s/g, '');

  DOCS.forEach((html, i) => {
    it(`document ${i + 1}`, () => {
      make(html);
      const starts: number[] = [];
      editor.state.doc.descendants((n, pos) => {
        if (n.isTextblock) starts.push(pos + 1);
      });
      const tops: number[] = [];
      editor.state.doc.forEach((_n, offset) => tops.push(offset));
      const words = squeeze(editor.state.doc.textContent);
      editor.destroy();
      const cases: ((e: Editor) => void)[] = [
        ...starts.map((p) => (e: Editor) => void e.commands.setTextSelection(p)),
        ...tops.map((p) => (e: Editor) => void e.commands.setNodeSelection(p)),
        (e: Editor) => void e.commands.selectAll(),
      ];
      for (const prepare of cases) {
        for (const target of ALL) {
          make(html);
          prepare(editor);
          expect(turnInto(editor, target)).toBe(true);
          expect(editor.state.doc.check()).toBeUndefined();
          expect(squeeze(editor.state.doc.textContent)).toBe(words);
          editor.destroy();
        }
      }
    }, 60_000);
  });
});
