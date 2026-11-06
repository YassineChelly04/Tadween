import { Extension } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { detectDir, type Dir } from '../../lib/direction';

// Every block gets a `dir` attribute computed from its own text: Arabic is
// written right to left, Latin left to right, block by block, like Notion.
// An empty block takes the direction of the block before it, so pressing
// Enter at the end of an Arabic paragraph keeps the caret on the right.
// Code is always left to right. The interface language plays no part.

const CONTAINERS = new Set([
  'bulletList',
  'orderedList',
  'taskList',
  'listItem',
  'taskItem',
  'blockquote',
  'callout',
  'details',
  'detailsContent',
  'table',
]);

export const directionKey = new PluginKey<{ fallback: Dir; set: DecorationSet }>('tadween-direction');

function build(doc: PMNode, fallback: Dir): DecorationSet {
  const decorations: Decoration[] = [];
  let previous: Dir = fallback;

  doc.descendants((node, pos) => {
    const name = node.type.name;
    if (name === 'codeBlock') {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { dir: 'ltr' }));
      return false;
    }
    if (node.isTextblock) {
      const own = detectDir(node.textContent);
      if (own) previous = own;
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { dir: own ?? previous }));
      return false;
    }
    if (CONTAINERS.has(name)) {
      const dir = detectDir(node.textContent) ?? previous;
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { dir }));
    }
    return true;
  });

  return DecorationSet.create(doc, decorations);
}

export interface DirectionOptions {
  /** Direction for a document with no text yet. */
  fallback: Dir;
}

export const BlockDirection = Extension.create<DirectionOptions>({
  name: 'blockDirection',

  addOptions() {
    return { fallback: 'ltr' };
  },

  addProseMirrorPlugins() {
    const initial = this.options.fallback;
    return [
      new Plugin({
        key: directionKey,
        state: {
          init: (_, state) => ({ fallback: initial, set: build(state.doc, initial) }),
          apply(tr, value, _old, state) {
            const fallback: Dir = tr.getMeta(directionKey) ?? value.fallback;
            if (tr.docChanged || fallback !== value.fallback) {
              return { fallback, set: build(state.doc, fallback) };
            }
            return value;
          },
        },
        props: {
          decorations(state) {
            return directionKey.getState(state)?.set ?? DecorationSet.empty;
          },
        },
      }),
    ];
  },
});
