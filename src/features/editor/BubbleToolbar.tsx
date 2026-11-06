import { useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useTranslation } from 'react-i18next';
import { Bold, Check, ChevronDown, Code, ExternalLink, Highlighter, Italic, Link2, Strikethrough, Underline, Unlink } from 'lucide-react';
import { api } from '../../lib/api';
import { BLOCKS, blockLabel } from './blocks';

export const LINK_EVENT = 'tadween:link';

/** Accepts "example.com", "https://…", "mailto:…"; refuses script URLs. */
function normalizeUrl(raw: string): string | null {
  const url = raw.trim();
  if (!url) return null;
  if (/^(javascript|data|vbscript|file):/i.test(url)) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  if (/^[^\s]+\.[^\s]+$/.test(url)) return `https://${url}`;
  return null;
}

export function BubbleToolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const [linkMode, setLinkMode] = useState(false);
  const [turnOpen, setTurnOpen] = useState(false);
  const [href, setHref] = useState('');
  const linkInput = useRef<HTMLInputElement>(null);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      code: e.isActive('code'),
      highlight: e.isActive('highlight'),
      link: (e.getAttributes('link').href as string | undefined) ?? null,
      block: BLOCKS.filter((b) => b.convertible).find((b) => b.isActive?.(e))?.id ?? 'text',
    }),
  });

  useEffect(() => {
    if (linkMode) linkInput.current?.focus();
  }, [linkMode]);

  // Ctrl+K with text selected (see LinkShortcut in extensions.ts).
  useEffect(() => {
    const open = () => {
      setHref((editor.getAttributes('link').href as string | undefined) ?? '');
      setLinkMode(true);
    };
    window.addEventListener(LINK_EVENT, open);
    return () => window.removeEventListener(LINK_EVENT, open);
  }, [editor]);

  const marks = [
    { key: 'bold', icon: Bold, active: state.bold, run: () => editor.chain().focus().toggleBold().run(), kbd: 'Ctrl B' },
    { key: 'italic', icon: Italic, active: state.italic, run: () => editor.chain().focus().toggleItalic().run(), kbd: 'Ctrl I' },
    {
      key: 'underline',
      icon: Underline,
      active: state.underline,
      run: () => editor.chain().focus().toggleUnderline().run(),
      kbd: 'Ctrl U',
    },
    { key: 'strike', icon: Strikethrough, active: state.strike, run: () => editor.chain().focus().toggleStrike().run(), kbd: 'Ctrl Shift S' },
    { key: 'code', icon: Code, active: state.code, run: () => editor.chain().focus().toggleCode().run(), kbd: 'Ctrl E' },
  ] as const;

  const applyLink = () => {
    const url = normalizeUrl(href);
    const chain = editor.chain().focus().extendMarkRange('link');
    if (url) chain.setLink({ href: url }).run();
    else chain.unsetLink().run();
    setLinkMode(false);
  };

  return (
    <BubbleMenu
      editor={editor}
      className="bubble"
      options={{
        placement: 'top',
        offset: 8,
        flip: true,
        shift: { padding: 8 },
        onHide: () => {
          setLinkMode(false);
          setTurnOpen(false);
        },
      }}
      shouldShow={({ editor: e, state: s, from, to }) => {
        if (!e.isEditable || from === to) return false;
        if (s.selection instanceof NodeSelection || s.selection instanceof CellSelection) return false;
        if (e.isActive('codeBlock')) return false;
        return s.doc.textBetween(from, to).trim().length > 0;
      }}
    >
      {linkMode ? (
        <form
          className="bubble-link"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <Link2 size={15} strokeWidth={1.5} />
          <input
            ref={linkInput}
            dir="ltr"
            value={href}
            placeholder={t('editor.linkPlaceholder')}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setLinkMode(false);
                editor.commands.focus();
              }
            }}
          />
          <button type="submit" className="bubble-btn" aria-label={t('common.save')}>
            <Check size={15} />
          </button>
          {state.link && (
            <button
              type="button"
              className="bubble-btn"
              aria-label={t('editor.openLink')}
              title={t('editor.openLink')}
              onClick={() => void api.openLink(state.link as string)}
            >
              <ExternalLink size={15} strokeWidth={1.5} />
            </button>
          )}
          {state.link && (
            <button
              type="button"
              className="bubble-btn"
              aria-label={t('editor.removeLink')}
              title={t('editor.removeLink')}
              onClick={() => {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
                setLinkMode(false);
              }}
            >
              <Unlink size={15} strokeWidth={1.5} />
            </button>
          )}
        </form>
      ) : (
        <>
          <div className="bubble-turn">
            <button
              className="bubble-btn bubble-turn-btn"
              aria-haspopup="menu"
              aria-expanded={turnOpen}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setTurnOpen((o) => !o)}
            >
              {blockLabel(state.block)[0]}
              <ChevronDown size={13} />
            </button>
            {turnOpen && (
              <div className="menu turn-menu" role="menu">
                <div className="menu-label t-label">{t('editor.turnInto')}</div>
                {BLOCKS.filter((b) => b.convertible).map((b) => {
                  const Icon = b.icon;
                  return (
                    <button
                      key={b.id}
                      role="menuitem"
                      className="menu-item"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        b.run(editor);
                        setTurnOpen(false);
                      }}
                    >
                      <Icon size={16} strokeWidth={1.5} />
                      <span style={{ flex: 1 }}>{blockLabel(b.id)[0]}</span>
                      {state.block === b.id && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <span className="bubble-sep" />
          {marks.map(({ key, icon: Icon, active, run, kbd }) => (
            <button
              key={key}
              className="bubble-btn"
              aria-pressed={active}
              aria-label={t(`editor.marks.${key}`)}
              title={`${t(`editor.marks.${key}`)}  ${kbd}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={run}
            >
              <Icon size={15} strokeWidth={active ? 2.25 : 1.75} />
            </button>
          ))}
          <span className="bubble-sep" />
          <button
            className="bubble-btn"
            aria-pressed={!!state.link}
            aria-label={t('editor.marks.link')}
            title={`${t('editor.marks.link')}  Ctrl K`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setHref(state.link ?? '');
              setLinkMode(true);
            }}
          >
            <Link2 size={15} strokeWidth={1.75} />
          </button>
          <button
            className="bubble-btn"
            aria-pressed={state.highlight}
            aria-label={t('editor.marks.highlight')}
            title={`${t('editor.marks.highlight')}  Ctrl Shift H`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().toggleHighlight().run()}
          >
            <Highlighter size={15} strokeWidth={1.75} />
          </button>
        </>
      )}
    </BubbleMenu>
  );
}
