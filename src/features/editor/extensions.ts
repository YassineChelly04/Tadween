import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder, CharacterCount } from '@tiptap/extensions';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import { TableKit } from '@tiptap/extension-table';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import i18n from '../../i18n';
import type { Dir } from '../../lib/direction';
import { BlockDirection } from './direction';
import { Callout } from './callout';
import { SlashCommand } from './slash';
import { LINK_EVENT } from './BubbleToolbar';
import { Pdf } from './pdf';
import { PageLink } from './pageLink';
import { Column, Columns } from './columns';
import { Dictation } from './dictation';

/** Ctrl+K on a selection opens the link field; otherwise the global search takes it. */
const LinkShortcut = Extension.create({
  name: 'linkShortcut',
  addKeyboardShortcuts() {
    return {
      'Mod-k': () => {
        if (this.editor.state.selection.empty) return false;
        window.dispatchEvent(new Event(LINK_EVENT));
        return true;
      },
    };
  },
});

export function createExtensions(fallback: Dir) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: null, title: i18n.t('editor.linkHint') },
      },
      dropcursor: { color: 'var(--lapis)', width: 2 },
      codeBlock: { HTMLAttributes: { spellcheck: 'false' } },
    }),
    Placeholder.configure({
      includeChildren: true,
      showOnlyCurrent: true,
      placeholder: ({ node }) => {
        switch (node.type.name) {
          case 'heading':
            return i18n.t(`editor.heading${node.attrs.level}`);
          case 'detailsSummary':
            return i18n.t('editor.toggle');
          case 'codeBlock':
            return '';
          default:
            return i18n.t('editor.placeholder');
        }
      },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Highlight,
    TableKit.configure({ table: { resizable: true } }),
    Image.configure({
      allowBase64: true,
      resize: { enabled: true, directions: ['bottom-right', 'bottom-left'], minWidth: 80, minHeight: 40, alwaysPreserveAspectRatio: true },
    }),
    Details.configure({ persist: true, HTMLAttributes: { class: 'toggle' } }),
    DetailsSummary,
    DetailsContent,
    Callout,
    Pdf,
    PageLink,
    Columns,
    Column,
    CharacterCount,
    BlockDirection.configure({ fallback }),
    SlashCommand,
    LinkShortcut,
    Dictation,
  ];
}
