import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Extension, type Editor, type Range } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import Suggestion, { type SuggestionKeyDownProps, type SuggestionProps } from '@tiptap/suggestion';
import { useTranslation } from 'react-i18next';
import { blockLabel, filterBlocks, runFromSlash, type BlockDef } from './blocks';

interface MenuProps {
  items: BlockDef[];
  command: (block: BlockDef) => void;
}

interface MenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const GROUP_ORDER: BlockDef['group'][] = ['basic', 'lists', 'media', 'layout'];

const SlashMenu = forwardRef<MenuHandle, MenuProps>(function SlashMenu({ items, command }, ref) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep items in display order (grouped) so arrow keys follow what is shown.
  const ordered = GROUP_ORDER.flatMap((g) => items.filter((i) => i.group === g));

  useEffect(() => setSelected(0), [items]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (!ordered.length) return false;
      if (event.key === 'ArrowDown') {
        setSelected((s) => (s + 1) % ordered.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        setSelected((s) => (s - 1 + ordered.length) % ordered.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        command(ordered[selected]);
        return true;
      }
      return false;
    },
  }));

  if (!ordered.length) {
    return (
      <div className="menu slash-menu">
        <div className="slash-empty t-muted">{t('editor.noResults')}</div>
      </div>
    );
  }

  let index = -1;
  return (
    <div className="menu slash-menu" ref={listRef} role="listbox">
      {GROUP_ORDER.map((group) => {
        const groupItems = ordered.filter((i) => i.group === group);
        if (!groupItems.length) return null;
        return (
          <div key={group} role="group" aria-label={t(`editor.groups.${group}`)}>
            <div className="menu-label t-label">{t(`editor.groups.${group}`)}</div>
            {groupItems.map((item) => {
              index += 1;
              const i = index;
              const [label, description] = blockLabel(item.id);
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  data-index={i}
                  role="option"
                  aria-selected={selected === i}
                  data-active={selected === i}
                  className="menu-item slash-item"
                  onMouseEnter={() => setSelected(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => command(item)}
                >
                  <span className="slash-icon">
                    <Icon size={18} strokeWidth={1.5} />
                  </span>
                  <span className="slash-text">
                    <span>{label}</span>
                    <small>{description}</small>
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
});

function place(element: HTMLElement, rect: DOMRect | null | undefined) {
  if (!rect) return;
  const height = element.offsetHeight || 320;
  const width = element.offsetWidth || 280;
  const below = rect.bottom + 6;
  const fitsBelow = below + height < window.innerHeight - 8;
  const top = fitsBelow ? below : Math.max(8, rect.top - height - 6);
  const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  Object.assign(element.style, { position: 'fixed', top: `${top}px`, left: `${left}px`, zIndex: '60' });
}

const slashKey = new PluginKey('slash');

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<BlockDef, BlockDef>({
        editor: this.editor,
        pluginKey: slashKey,
        char: '/',
        allowSpaces: false,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return $from.parent.type.name !== 'codeBlock';
        },
        items: ({ query }) => filterBlocks(query),
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: BlockDef }) =>
          runFromSlash(editor, range, props),
        render: () => {
          let renderer: ReactRenderer<MenuHandle, MenuProps> | null = null;
          return {
            onStart: (props: SuggestionProps<BlockDef, BlockDef>) => {
              renderer = new ReactRenderer(SlashMenu, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
              });
              document.body.appendChild(renderer.element);
              requestAnimationFrame(() => renderer && place(renderer.element as HTMLElement, props.clientRect?.()));
            },
            onUpdate: (props: SuggestionProps<BlockDef, BlockDef>) => {
              renderer?.updateProps({ items: props.items, command: props.command });
              requestAnimationFrame(() => renderer && place(renderer.element as HTMLElement, props.clientRect?.()));
            },
            // Escape is handled by Suggestion itself (it calls onExit).
            onKeyDown: (props: SuggestionKeyDownProps) => renderer?.ref?.onKeyDown(props.event) ?? false,
            onExit: () => {
              renderer?.element.remove();
              renderer?.destroy();
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
