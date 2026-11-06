import { useEffect, useState } from 'react';
import { findParentNode, type Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Columns2,
  Heading,
  Merge,
  Plus,
  Rows2,
  Split,
  Trash2,
} from 'lucide-react';

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Tools for the table under the caret: a toolbar above it, and "+" bars on its
 * bottom and right edges that add a row or a column in one click.
 */
export function TableControls({ editor, host }: { editor: Editor; host: HTMLElement | null }) {
  const { t } = useTranslation();
  const [box, setBox] = useState<Box | null>(null);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const table = findParentNode((n) => n.type.name === 'table')(e.state.selection);
      return {
        // Only while the editor has focus: the tools follow the caret.
        tablePos: table && e.isFocused ? table.pos : -1,
        canMerge: e.can().mergeCells(),
        canSplit: e.can().splitCell(),
      };
    },
  });

  // Track where the table is on screen, relative to the editor host.
  useEffect(() => {
    if (state.tablePos < 0 || !host) {
      setBox(null);
      return;
    }
    const measure = () => {
      const dom = editor.view.nodeDOM(state.tablePos) as HTMLElement | null;
      const wrapper = dom?.closest?.('.tableWrapper') ?? dom;
      if (!wrapper || !(wrapper instanceof HTMLElement)) return setBox(null);
      const table = wrapper.querySelector('table') ?? wrapper;
      const r = table.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      setBox({ top: r.top - h.top, left: r.left - h.left, width: Math.min(r.width, wrapper.clientWidth), height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    editor.on('transaction', measure);
    return () => {
      ro.disconnect();
      editor.off('transaction', measure);
    };
  }, [editor, host, state.tablePos]);

  if (!box || !editor.isEditable) return null;

  /** Puts the caret in the table's last row or column, then runs `fn`. */
  const atEdge = (edge: 'row' | 'col', fn: () => void) => {
    const table = editor.state.doc.nodeAt(state.tablePos);
    if (!table) return;
    let target = -1;
    const lastRow = table.childCount - 1;
    table.forEach((row, rowOffset, rowIndex) => {
      row.forEach((_cell, cellOffset, cellIndex) => {
        const pos = state.tablePos + 1 + rowOffset + 1 + cellOffset + 1;
        if (edge === 'row' && rowIndex === lastRow && cellIndex === 0) target = pos;
        if (edge === 'col' && rowIndex === 0 && cellIndex === row.childCount - 1) target = pos;
      });
    });
    if (target < 0) return;
    editor.chain().focus().setTextSelection(target + 1).run();
    fn();
  };

  const tools = [
    { icon: ArrowUpToLine, label: t('table.rowAbove'), run: () => editor.chain().focus().addRowBefore().run() },
    { icon: ArrowDownToLine, label: t('table.rowBelow'), run: () => editor.chain().focus().addRowAfter().run() },
    { icon: ArrowLeftToLine, label: t('table.colLeft'), run: () => editor.chain().focus().addColumnBefore().run() },
    { icon: ArrowRightToLine, label: t('table.colRight'), run: () => editor.chain().focus().addColumnAfter().run() },
    { sep: true },
    { icon: Heading, label: t('table.header'), run: () => editor.chain().focus().toggleHeaderRow().run() },
    { icon: Merge, label: t('table.merge'), run: () => editor.chain().focus().mergeCells().run(), disabled: !state.canMerge },
    { icon: Split, label: t('table.split'), run: () => editor.chain().focus().splitCell().run(), disabled: !state.canSplit },
    { sep: true },
    { icon: Rows2, label: t('table.deleteRow'), run: () => editor.chain().focus().deleteRow().run(), danger: true },
    { icon: Columns2, label: t('table.deleteCol'), run: () => editor.chain().focus().deleteColumn().run(), danger: true },
    { icon: Trash2, label: t('table.delete'), run: () => editor.chain().focus().deleteTable().run(), danger: true },
  ] as const;

  return (
    <>
      <div className="table-toolbar" style={{ top: box.top - 40, left: box.left }} onMouseDown={(e) => e.preventDefault()}>
        {tools.map((tool, i) =>
          'sep' in tool ? (
            <span key={i} className="bubble-sep" />
          ) : (
            <button
              key={i}
              className={'danger' in tool ? 'bubble-btn danger' : 'bubble-btn'}
              title={tool.label}
              aria-label={tool.label}
              disabled={'disabled' in tool ? tool.disabled : false}
              onClick={tool.run}
            >
              <tool.icon size={15} strokeWidth={1.75} />
            </button>
          ),
        )}
      </div>
      <button
        className="table-add table-add-row"
        style={{ top: box.top + box.height + 4, left: box.left, width: box.width }}
        title={t('table.addRow')}
        aria-label={t('table.addRow')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => atEdge('row', () => editor.chain().focus().addRowAfter().run())}
      >
        <Plus size={14} />
      </button>
      <button
        className="table-add table-add-col"
        style={{ top: box.top, left: box.left + box.width + 4, height: box.height }}
        title={t('table.addCol')}
        aria-label={t('table.addCol')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => atEdge('col', () => editor.chain().focus().addColumnAfter().run())}
      >
        <Plus size={14} />
      </button>
    </>
  );
}
