import { mergeAttributes, Node } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    columns: {
      insertColumns: (count: 2 | 3 | 4) => ReturnType;
    };
  }
}

/** One column: any blocks. */
export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-column]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-column': '', class: 'column' }), 0];
  },
});

/** Splits the page into 2, 3 or 4 side-by-side columns. */
export const Columns = Node.create({
  name: 'columns',
  group: 'block',
  content: 'column{2,4}',
  isolating: true,
  defining: true,

  addAttributes() {
    return {
      count: {
        default: 2,
        parseHTML: (el) => Number(el.getAttribute('data-count')) || el.querySelectorAll(':scope > [data-column]').length || 2,
        renderHTML: (attrs) => ({ 'data-count': attrs.count }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-columns]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-columns': '', class: 'columns' }), 0];
  },

  addCommands() {
    return {
      insertColumns:
        (count) =>
        ({ state, chain }) => {
          const start = state.selection.from;
          return chain()
            .insertContent({
              type: this.name,
              attrs: { count },
              content: Array.from({ length: count }, () => ({ type: 'column', content: [{ type: 'paragraph' }] })),
            })
            // Put the caret in the first column, ready to write.
            .command(({ tr }) => {
              let target = -1;
              const to = Math.min(tr.doc.content.size, start + 8);
              tr.doc.nodesBetween(Math.max(0, start - 4), to, (node, pos) => {
                if (target >= 0) return false;
                if (node.type.name === 'column') {
                  target = pos;
                  return false;
                }
                return true;
              });
              if (target >= 0) tr.setSelection(TextSelection.near(tr.doc.resolve(target + 2)));
              return true;
            })
            .run();
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Backspace at the very start of the first column does nothing rather
      // than tearing the layout apart.
      Backspace: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.parentOffset > 0) return false;
        for (let d = $from.depth; d > 0; d--) {
          if ($from.node(d).type.name === 'column') {
            const column = $from.node(d);
            const isFirstBlock = $from.index(d) === 0;
            return isFirstBlock && column.childCount === 1 && column.firstChild?.content.size === 0;
          }
        }
        return false;
      },
    };
  },
});
