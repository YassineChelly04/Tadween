// "Turn into" for any selection, including ones that run across nested lists.
//
// TipTap's clearNodes() + setX() chain throws on nested to-do lists ("Invalid
// content for node type paragraph") and leaves the first item behind for
// headings. Instead, the blocks around the selection are read into a flat
// list of lines (text, list kind, nesting level, the quote or callout around
// it), the selected lines are given the new kind, and the whole run is rebuilt
// in one replace. Lines before and after the selection keep what they were, so
// turning two items of a long list into headings splits the list around them.
//
// A selection across table cells or columns is several runs, one per cell or
// column: their rows and columns themselves can never be wrapped or replaced.

import type { Editor } from '@tiptap/core';
import { Fragment, type Node as PMNode, type NodeType, type Schema } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';

export type TurnTarget = 'text' | 'h1' | 'h2' | 'h3' | 'code' | 'bullet' | 'numbered' | 'todo' | 'quote' | 'callout' | 'toggle';

type ListKind = 'bullet' | 'numbered' | 'todo';
type TextTarget = 'text' | 'h1' | 'h2' | 'h3' | 'code';

interface Line {
  /** A textblock (paragraph, heading, code), or any other block kept as is. */
  node: PMNode;
  opaque: boolean;
  list: ListKind | null;
  level: number;
  checked: boolean;
  selected: boolean;
  /** The quote or callout this line sits in, rebuilt around lines that stay. */
  wrap: PMNode | null;
  /** The line came out of a toggle. */
  fromToggle: boolean;
}

interface Edit {
  start: number;
  end: number;
  nodes: PMNode[];
  selFrom: number;
  selTo: number;
}

const LIST_OF: Record<string, ListKind> = { bulletList: 'bullet', orderedList: 'numbered', taskList: 'todo' };
const LIST_NODE: Record<ListKind, string> = { bullet: 'bulletList', numbered: 'orderedList', todo: 'taskList' };
const ITEM_NODE: Record<ListKind, string> = { bullet: 'listItem', numbered: 'listItem', todo: 'taskItem' };
const LISTISH = new Set(['bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'details', 'detailsSummary']);
const WRAPPERS = new Set(['blockquote', 'callout']);
/** Their children only make sense where they are: work inside each one. */
const STRUCTURAL = new Set(['table', 'tableRow', 'columns']);

/** Text of a block with its line breaks; a code block keeps them as newlines. */
const plainText = (node: PMNode) => node.textBetween(0, node.content.size, '\n', '\n');

/** Code text as inline content: newlines become line breaks. */
function codeToInline(schema: Schema, text: string): Fragment {
  const nodes: PMNode[] = [];
  text.split('\n').forEach((part, i) => {
    if (i > 0) nodes.push(schema.nodes.hardBreak.create());
    if (part) nodes.push(schema.text(part));
  });
  return Fragment.fromArray(nodes);
}

/** The textblock as a paragraph, heading or code block, keeping its inline content. */
function convertText(schema: Schema, node: PMNode, target: TextTarget): PMNode {
  if (target === 'code') {
    const text = plainText(node);
    return schema.nodes.codeBlock.create(null, text ? schema.text(text) : null);
  }
  // A code block's text has no marks; other textblocks keep theirs.
  const content = node.type.name === 'codeBlock' ? codeToInline(schema, node.textContent) : node.content;
  if (target === 'text') return schema.nodes.paragraph.create(null, content);
  return schema.nodes.heading.create({ level: Number(target[1]) }, content);
}

/** Reads the blocks between `startIndex` and `endIndex` of `parent` into lines. */
function readLines(schema: Schema, parent: PMNode, parentStart: number, from: number, to: number, startIndex: number, endIndex: number): Line[] {
  const lines: Line[] = [];
  const overlaps = (pos: number, node: PMNode) => pos < to && pos + node.nodeSize > from;
  const line = (node: PMNode, fields: Partial<Line>): Line => ({
    node,
    opaque: false,
    list: null,
    level: 0,
    checked: false,
    selected: false,
    wrap: null,
    fromToggle: false,
    ...fields,
  });

  const visit = (node: PMNode, pos: number, list: ListKind | null, level: number, checked: boolean, wrap: PMNode | null, top: boolean) => {
    const kind = LIST_OF[node.type.name];
    if (kind) {
      node.forEach((item, offset) => {
        const itemPos = pos + 1 + offset;
        item.forEach((child, childOffset) => {
          const childPos = itemPos + 1 + childOffset;
          if (childOffset === 0 && child.isTextblock) {
            lines.push(line(child, { list: kind, level, checked: !!item.attrs.checked, selected: overlaps(childPos, child), wrap }));
          } else visit(child, childPos, kind, level + 1, false, wrap, false);
        });
      });
    } else if (node.isTextblock) {
      lines.push(line(node, { list, level, checked, selected: overlaps(pos, node), wrap }));
    } else if (top && !wrap && WRAPPERS.has(node.type.name)) {
      node.forEach((child, offset) => visit(child, pos + 1 + offset, null, 0, false, node, true));
    } else if (top && !wrap && node.type.name === 'details' && overlaps(pos, node)) {
      // A toggle the selection touches comes apart whole: its parts make no
      // sense without each other.
      const first = lines.length;
      node.forEach((part) => {
        if (part.type.name === 'detailsSummary') lines.push(line(convertText(schema, part, 'text'), {}));
        else part.forEach((child, offset) => visit(child, pos + 1 + offset, null, 0, false, null, false));
      });
      for (let i = first; i < lines.length; i++) lines[i] = { ...lines[i], selected: true, fromToggle: true };
    } else {
      lines.push(line(node, { opaque: true, selected: overlaps(pos, node), wrap }));
    }
  };

  parent.forEach((child, offset, index) => {
    if (index >= startIndex && index < endIndex) visit(child, parentStart + offset, null, 0, false, null, true);
  });
  return lines;
}

/** The first line sits at level 0 and no line is more than one deeper than the one before. */
function normalizeLevels(lines: Line[]): Line[] {
  let previous = -1;
  return lines.map((l) => {
    const level = Math.min(l.level, previous + 1);
    previous = level;
    return { ...l, level };
  });
}

function buildLists(schema: Schema, lines: Line[], level: number): PMNode[] {
  const lists: PMNode[] = [];
  let items: PMNode[] = [];
  let kind: ListKind | null = null;
  const close = () => {
    if (kind && items.length) lists.push(schema.nodes[LIST_NODE[kind]].create(null, items));
    items = [];
  };
  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    let j = i + 1;
    while (j < lines.length && lines[j].level > level) j++;
    const lineKind = line.list as ListKind;
    if (lineKind !== kind) {
      close();
      kind = lineKind;
    }
    const paragraph = line.node.type.name === 'paragraph' ? line.node : convertText(schema, line.node, 'text');
    const children = buildLists(schema, lines.slice(i + 1, j), level + 1);
    const itemType: NodeType = schema.nodes[ITEM_NODE[lineKind]];
    items.push(itemType.create(lineKind === 'todo' ? { checked: line.checked } : null, [paragraph, ...children]));
    i = j;
  }
  close();
  return lists;
}

/** Lines → blocks: plain lines as they are, list lines grouped into (nested) lists. */
function build(schema: Schema, lines: Line[]): PMNode[] {
  const out: PMNode[] = [];
  for (let i = 0; i < lines.length; ) {
    const { wrap, list, node } = lines[i];
    let j = i + 1;
    if (wrap) {
      while (j < lines.length && lines[j].wrap === wrap) j++;
      out.push(wrap.type.create(wrap.attrs, build(schema, unwrapped(lines.slice(i, j)))));
    } else if (list) {
      while (j < lines.length && lines[j].list && !lines[j].wrap) j++;
      out.push(...buildLists(schema, normalizeLevels(lines.slice(i, j)), 0));
    } else out.push(node);
    i = j;
  }
  return out;
}

const unwrapped = (lines: Line[]) => lines.map((l) => ({ ...l, wrap: null }));

/** A toggle titled by the first line, holding the rest. */
function toggleFrom(schema: Schema, lines: Line[]): PMNode {
  const titled = lines[0] && !lines[0].opaque;
  const title = titled ? lines[0].node.textContent : '';
  const body = build(schema, titled ? lines.slice(1) : lines);
  const { details, detailsSummary, detailsContent, paragraph } = schema.nodes;
  return details.create({ open: true }, [
    detailsSummary.create(null, title ? schema.text(title) : null),
    detailsContent.create(null, body.length ? body : [paragraph.create()]),
  ]);
}

function size(nodes: PMNode[]): number {
  return nodes.reduce((s, n) => s + n.nodeSize, 0);
}

/** Splits a selection across cells or columns into one range per cell or column. */
function scopes(doc: PMNode, from: number, to: number): { from: number; to: number }[] {
  const $from = doc.resolve(from);
  const range = $from.blockRange(doc.resolve(to));
  if (!range || !STRUCTURAL.has($from.node(range.depth).type.name)) return [{ from, to }];
  const out: { from: number; to: number }[] = [];
  doc.nodesBetween(from, to, (node, pos) => {
    const role = node.type.spec.tableRole as string | undefined;
    if (role !== 'cell' && role !== 'header_cell' && node.type.name !== 'column') return true;
    const start = Math.max(from, pos + 1);
    const end = Math.min(to, pos + node.nodeSize - 1);
    if (start < end) out.push({ from: start, to: end });
    return false;
  });
  return out;
}

/** Works out the replacement for one range, or null when it cannot be done. */
function plan(schema: Schema, doc: PMNode, from: number, to: number, target: TurnTarget): Edit | null {
  const $from = doc.resolve(from);
  const $to = doc.resolve(to);
  const range = $from.blockRange($to);
  if (!range) return null;

  // Climb out of lists and toggles, whose parts must stay together, so the
  // whole of them is read and rebuilt. A quote is one block with its text, so
  // turning it into anything leaves it; a callout holds blocks of its own and
  // only lets go for plain text or for another wrapper.
  const leaves = (name: string) =>
    LISTISH.has(name) || name === 'blockquote' || (name === 'callout' && (target === 'text' || target === 'quote' || target === 'callout'));
  let depth = range.depth;
  while (depth > 0 && leaves($from.node(depth).type.name)) depth--;

  const parent = $from.node(depth);
  const startIndex = $from.index(depth);
  const endIndex = $to.indexAfter(depth);
  const start = $from.posAtIndex(startIndex, depth);
  const end = $from.posAtIndex(endIndex, depth);
  const lines = readLines(schema, parent, $from.start(depth), from, to, startIndex, endIndex);
  if (!lines.length) return null;

  let first = lines.findIndex((l) => l.selected);
  let last = lines.length - 1 - [...lines].reverse().findIndex((l) => l.selected);
  if (first < 0) {
    // A cursor between blocks, e.g. after a table: take the whole range.
    first = 0;
    last = lines.length - 1;
  }
  // Select-all also takes the empty line the editor keeps at the end; leave it be.
  while (last > first && !lines[last].opaque && lines[last].node.content.size === 0) last--;
  const before = lines.slice(0, first);
  const middle = lines.slice(first, last + 1);
  const after = lines.slice(last + 1);
  const plain = unwrapped(middle);

  let converted: PMNode[];
  if (target === 'quote' || target === 'callout') {
    const type = schema.nodes[target === 'quote' ? 'blockquote' : 'callout'];
    // Already inside this wrapper: it comes off, like a toggle.
    const off = middle.every((l) => l.wrap?.type === type);
    converted = off ? build(schema, plain) : [type.create(null, build(schema, plain))];
  } else if (target === 'toggle') {
    converted = middle.every((l) => l.fromToggle) ? build(schema, plain) : [toggleFrom(schema, plain)];
  } else if (target === 'bullet' || target === 'numbered' || target === 'todo') {
    const textLines = plain.filter((l) => !l.opaque);
    // Already all this kind of list: turn it back into text, like a toggle.
    const off = textLines.length > 0 && textLines.every((l) => l.list === target);
    const base = Math.min(...textLines.map((l) => (l.list ? l.level : 0)));
    converted = build(
      schema,
      plain.map((l) =>
        l.opaque
          ? l
          : off
            ? { ...l, node: convertText(schema, l.node, 'text'), list: null, level: 0 }
            : { ...l, list: target, level: l.list ? l.level - base : 0, checked: target === 'todo' && l.list === 'todo' ? l.checked : false },
      ),
    );
  } else {
    converted = plain.map((l) => (l.opaque ? l.node : convertText(schema, l.node, target)));
  }

  const head = build(schema, before);
  const tail = build(schema, after);
  const nodes = [...head, ...converted, ...tail];

  // Validate before touching the document: a bad structure must not throw mid-edit.
  if (!parent.canReplace(startIndex, endIndex, Fragment.from(nodes))) return null;
  const selFrom = start + size(head);
  return { start, end, nodes, selFrom, selTo: selFrom + size(converted) };
}

/** Converts the blocks touched by the selection. Returns false when nothing could be done. */
export function turnInto(editor: Editor, target: TurnTarget): boolean {
  const { state } = editor;
  const { doc, schema, selection } = state;
  const edits: Edit[] = [];
  for (const scope of scopes(doc, selection.from, selection.to)) {
    const edit = plan(schema, doc, scope.from, scope.to, target);
    if (!edit) return false;
    edits.push(edit);
  }
  if (!edits.length) return false;

  // Last first, so the earlier positions stay valid.
  const tr = state.tr;
  for (const edit of [...edits].reverse()) tr.replaceWith(edit.start, edit.end, edit.nodes);
  if (edits.length === 1) {
    const { selFrom, selTo } = edits[0];
    try {
      tr.setSelection(TextSelection.between(tr.doc.resolve(selFrom + 1), tr.doc.resolve(Math.max(selFrom + 1, selTo - 1)), -1));
    } catch {
      /* the default mapped selection is fine */
    }
  }
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}
