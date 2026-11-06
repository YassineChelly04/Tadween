import { Extension, type Editor } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { detectDir } from '../../lib/direction';

// Dictation writes where the caret is. While a phrase is being spoken, what
// has been heard so far shows at the caret as a widget: it is not part of the
// page, so it never reaches the saved note or the undo history. When the
// speaker pauses, the finished phrase is inserted as ordinary text and the
// caret moves after it, ready for the next one. Typing or clicking elsewhere
// in the meantime simply moves where the next phrase goes.

interface State {
  preview: string;
}

const dictationKey = new PluginKey<State>('tadween-dictation');

/** Closing punctuation never takes a space before it. */
const CLOSING = /^[.,،؛:!?؟)\]»]/;

function widget(text: string) {
  const span = document.createElement('span');
  span.className = 'dictation-live';
  span.textContent = text;
  span.setAttribute('aria-hidden', 'true');
  return span;
}

export const Dictation = Extension.create({
  name: 'dictation',

  addProseMirrorPlugins() {
    return [
      new Plugin<State>({
        key: dictationKey,
        state: {
          init: () => ({ preview: '' }),
          apply(tr, value) {
            const preview = tr.getMeta(dictationKey) as string | undefined;
            return preview === undefined ? value : { preview };
          },
        },
        props: {
          decorations(state) {
            const preview = dictationKey.getState(state)?.preview;
            if (!preview) return DecorationSet.empty;
            const { $head } = state.selection;
            if (!$head.parent.inlineContent) return DecorationSet.empty;
            const before = $head.nodeBefore?.text?.slice(-1) ?? '';
            const text = before && !/\s/.test(before) && !CLOSING.test(preview) ? ` ${preview}` : preview;
            const decorations = [
              Decoration.widget($head.pos, () => widget(text), { side: 1, key: `dictation:${text}`, ignoreSelection: true }),
            ];
            // An empty block has no direction of its own yet: give it the
            // preview's, so Arabic starts on the right before it is written.
            // A class, not `dir`: the block-direction plugin owns that attribute.
            const dir = $head.parent.content.size === 0 ? detectDir(preview) : null;
            if (dir && $head.depth > 0) {
              decorations.push(Decoration.node($head.before(), $head.after(), { class: `dictation-block dictation-${dir}` }));
            }
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

/** Shows the phrase in progress at the caret; an empty string hides it. */
export function showPreview(editor: Editor, text: string) {
  if (editor.isDestroyed) return;
  if ((dictationKey.getState(editor.state)?.preview ?? '') === text) return;
  editor.view.dispatch(editor.state.tr.setMeta(dictationKey, text).setMeta('addToHistory', false));
}

/** Writes a finished phrase at the caret, with a space before it when needed. */
export function commitPhrase(editor: Editor, text: string) {
  if (editor.isDestroyed) return;
  const { state } = editor;
  let tr = state.tr.setMeta(dictationKey, '');
  const phrase = text.trim();
  if (phrase) {
    let { $head } = state.selection;
    if (!state.selection.empty) {
      // Speaking over a selection replaces it, as typing would.
      tr = tr.deleteSelection();
      $head = tr.selection.$head;
    }
    if (!$head.parent.inlineContent) {
      // Caret on an image or a table edge: start a paragraph at the end.
      const end = tr.doc.content.size;
      tr = tr.insert(end, state.schema.nodes.paragraph.create());
      tr = tr.setSelection(TextSelection.create(tr.doc, end + 1));
      $head = tr.selection.$head;
    }
    const before = $head.nodeBefore?.text?.slice(-1) ?? '';
    const insert = before && !/\s/.test(before) && !CLOSING.test(phrase) ? ` ${phrase}` : phrase;
    tr = tr.insertText(insert, $head.pos);
    tr = tr.setSelection(TextSelection.create(tr.doc, $head.pos + insert.length));
    tr = tr.scrollIntoView();
  }
  editor.view.dispatch(tr);
}
