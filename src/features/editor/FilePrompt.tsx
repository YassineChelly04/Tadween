import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { useTranslation } from 'react-i18next';
import { FileText, Image as ImageIcon } from 'lucide-react';
import { useDismiss } from '../../lib/useDismiss';

// Windows' "Hide pointer while typing" hides the mouse pointer on the first
// keystroke. A file dialog opened straight from the keyboard ("/image" then
// Enter) comes up while it is hidden, and over WebView2 it can stay hidden
// there. So a picker asked for from the keyboard first shows this prompt: the
// hand moves to click it, which brings the pointer back before the dialog opens.

const FILE_PROMPT_EVENT = 'tadween:file-prompt';
export type FileKind = 'image' | 'pdf';

let lastInput: 'key' | 'pointer' = 'pointer';
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => (lastInput = 'key'), true);
  window.addEventListener('pointerdown', () => (lastInput = 'pointer'), true);
}

/** True when the action came from the keyboard (the pointer may be hidden). */
export const fromKeyboard = () => lastInput === 'key';

export function askForFile(kind: FileKind) {
  window.dispatchEvent(new CustomEvent(FILE_PROMPT_EVENT, { detail: kind }));
}

export function FilePrompt({ editor, choose }: { editor: Editor; choose: (kind: FileKind) => void }) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState<{ kind: FileKind; x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setPrompt(null), []);
  useDismiss(ref, prompt !== null, close);

  useEffect(() => {
    const onAsk = (e: Event) => {
      const kind = (e as CustomEvent<FileKind>).detail;
      const at = editor.view.coordsAtPos(editor.state.selection.from);
      setPrompt({ kind, x: Math.min(at.left, window.innerWidth - 340), y: Math.min(at.bottom + 8, window.innerHeight - 120) });
    };
    window.addEventListener(FILE_PROMPT_EVENT, onAsk);
    return () => window.removeEventListener(FILE_PROMPT_EVENT, onAsk);
  }, [editor]);

  if (!prompt) return null;
  const Icon = prompt.kind === 'image' ? ImageIcon : FileText;
  return (
    <div ref={ref} className="file-prompt" style={{ left: prompt.x, top: prompt.y }} role="dialog">
      <button
        className="file-prompt-btn"
        onClick={() => {
          setPrompt(null);
          choose(prompt.kind);
        }}
      >
        <Icon size={18} strokeWidth={1.5} />
        {t(prompt.kind === 'image' ? 'editor.chooseImage' : 'editor.choosePdf')}
      </button>
      <p className="file-prompt-hint">{t(prompt.kind === 'image' ? 'editor.chooseImageHint' : 'editor.choosePdfHint')}</p>
    </div>
  );
}
