import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, FileText } from 'lucide-react';
import { PageIcon } from '../../components/icons/PageIcon';
import { useApp } from '../../store';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pageLink: {
      insertPageLink: (pageId: string) => ReturnType;
    };
  }
}

/** A page written inside another page: one row in its parent, opened with a click. */
export const PageLink = Node.create({
  name: 'pageLink',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      pageId: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-page-id') ?? '',
        renderHTML: (attrs) => ({ 'data-page-id': attrs.pageId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-page-link]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-page-link': '' })];
  },

  addCommands() {
    return {
      insertPageLink:
        (pageId) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { pageId } }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(PageLinkView);
  },
});

/** The row for one sub-page, in the text and in the list under it. */
export function PageRow({ id }: { id: string }) {
  const { t } = useTranslation();
  const page = useApp((s) => s.notes.find((n) => n.id === id));
  const open = useApp((s) => s.open);
  const gone = !page;
  const trashed = !!page?.trashedAt;
  return (
    <button type="button" className="page-link" disabled={gone} data-off={gone || trashed} onClick={() => open({ kind: 'page', id })}>
      {page?.icon ? <PageIcon value={page.icon} size={18} /> : <FileText size={18} strokeWidth={1.5} />}
      <span className={page?.title ? 'page-link-title' : 'page-link-title t-muted'} dir="auto">
        {gone ? t('page.deleted') : page.title || t('page.untitled')}
      </span>
      {trashed && <span className="t-label">{t('page.inTrashShort')}</span>}
      {!gone && !trashed && <ArrowUpRight size={15} strokeWidth={1.75} className="page-link-go" />}
    </button>
  );
}

function PageLinkView({ node, selected }: NodeViewProps) {
  return (
    <NodeViewWrapper className="page-link-block" data-selected={selected} contentEditable={false} data-drag-handle>
      <PageRow id={node.attrs.pageId as string} />
    </NodeViewWrapper>
  );
}
