import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { Editor } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { DragHandle } from '@tiptap/extension-drag-handle-react';
import { useTranslation } from 'react-i18next';
import { Copy, GripVertical, Plus, Trash2 } from 'lucide-react';
import { BLOCKS, blockLabel } from './blocks';

interface Hovered {
  node: PMNode | null;
  pos: number;
}

// The Notion gutter: "+" adds a block below and opens the "/" menu; the grip
// drags the block, and a click on it opens Turn into / Duplicate / Delete.
export function BlockHandle({ editor }: { editor: Editor }) {
  const { t, i18n } = useTranslation();
  // The gutter is where a line starts, the right side in an Arabic layout.
  const position = useMemo(() => ({ placement: i18n.language === 'ar' ? ('right-start' as const) : ('left-start' as const), strategy: 'absolute' as const }), [i18n.language]);
  const hovered = useRef<Hovered>({ node: null, pos: -1 });
  const [menu, setMenu] = useState<{ x: number; y: number; target: Hovered } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    // Keeps the handle on its block while the menu is open. The lock commands
    // belong to the DragHandle extension; the React component only reads this.
    editor.commands.setMeta('lockDragHandle', true);
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      if (!editor.isDestroyed) editor.commands.setMeta('lockDragHandle', false);
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [menu, editor]);

  const addBelow = () => {
    const { node, pos } = hovered.current;
    if (!node || pos < 0) return;
    if (node.type.name === 'paragraph' && node.content.size === 0) {
      editor.chain().focus(pos + 1).insertContent('/').run();
      return;
    }
    const after = pos + node.nodeSize;
    editor
      .chain()
      .insertContentAt(after, { type: 'paragraph', content: [{ type: 'text', text: '/' }] })
      .focus(after + 2)
      .run();
  };

  const openMenu = (e: ReactMouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({ x: rect.left, y: rect.bottom + 4, target: { ...hovered.current } });
  };

  const act = (fn: (node: PMNode, pos: number) => void) => {
    if (menu?.target.node) fn(menu.target.node, menu.target.pos);
    setMenu(null);
  };

  const target = menu?.target.node;
  const convertible =
    !!target && (target.isTextblock || ['bulletList', 'orderedList', 'taskList', 'blockquote', 'callout', 'details'].includes(target.type.name));

  return (
    <>
      <DragHandle
        editor={editor}
        className="block-handle"
        computePositionConfig={position}
        onNodeChange={({ node, pos }) => {
          hovered.current = { node, pos };
        }}
      >
        <button className="bh-btn" aria-label={t('editor.add')} title={t('editor.add')} onClick={addBelow}>
          <Plus size={16} strokeWidth={1.75} />
        </button>
        <button className="bh-btn bh-grip" aria-label={t('editor.drag')} title={t('editor.drag')} onClick={openMenu}>
          <GripVertical size={16} strokeWidth={1.75} />
        </button>
      </DragHandle>

      {menu && (
        <div ref={menuRef} className="menu block-menu" role="menu" style={{ position: 'fixed', left: Math.min(menu.x, window.innerWidth - 240), top: menu.y }}>
          {convertible && (
            <>
              <div className="menu-label t-label">{t('editor.turnInto')}</div>
              {BLOCKS.filter((b) => b.convertible).map((b) => {
                const Icon = b.icon;
                return (
                  <button
                    key={b.id}
                    role="menuitem"
                    className="menu-item"
                    onClick={() =>
                      act((node, pos) => {
                        // The whole block, not just the place the caret would land.
                        if (node.isTextblock) editor.commands.setTextSelection(pos + 1);
                        else editor.commands.setNodeSelection(pos);
                        b.run(editor);
                      })
                    }
                  >
                    <Icon size={16} strokeWidth={1.5} />
                    {blockLabel(b.id)[0]}
                  </button>
                );
              })}
              <div className="menu-sep" />
            </>
          )}
          <button
            role="menuitem"
            className="menu-item"
            onClick={() =>
              act((node, pos) => {
                editor.chain().insertContentAt(pos + node.nodeSize, node.toJSON()).focus().run();
              })
            }
          >
            <Copy size={16} strokeWidth={1.5} />
            {t('page.duplicate')}
          </button>
          <button
            role="menuitem"
            className="menu-item danger"
            onClick={() =>
              act((node, pos) => {
                editor.chain().deleteRange({ from: pos, to: pos + node.nodeSize }).focus().run();
              })
            }
          >
            <Trash2 size={16} strokeWidth={1.5} />
            {t('common.delete')}
          </button>
        </div>
      )}
    </>
  );
}
