import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { mergeAttributes, Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { api } from '../../lib/api';

interface PdfAttrs {
  attachmentId: string;
  name: string;
  size: number;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pdf: {
      insertPdf: (attrs: PdfAttrs) => ReturnType;
    };
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** A PDF stored encrypted in the vault (see `attachments/` in vault.rs), previewed inline. */
export const Pdf = Node.create({
  name: 'pdf',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      attachmentId: { default: '', parseHTML: (el) => el.getAttribute('data-attachment-id') ?? '' },
      name: { default: 'document.pdf', parseHTML: (el) => el.getAttribute('data-name') ?? 'document.pdf' },
      size: { default: 0, parseHTML: (el) => Number(el.getAttribute('data-size')) || 0 },
      open: { default: true, rendered: false },
      height: { default: 620, rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-pdf]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-pdf': '',
        'data-attachment-id': node.attrs.attachmentId,
        'data-name': node.attrs.name,
        'data-size': String(node.attrs.size),
      }),
    ];
  },

  addCommands() {
    return {
      insertPdf:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(PdfView);
  },
});

function PdfView({ node, updateAttributes, selected }: NodeViewProps) {
  const { t } = useTranslation();
  const { attachmentId, name, size, open, height } = node.attrs as PdfAttrs & { open: boolean; height: number };
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const drag = useRef<{ y: number; h: number } | null>(null);

  useEffect(() => {
    if (!open || !attachmentId) return;
    let alive = true;
    let objectUrl: string | null = null;
    api
      .readAttachment(attachmentId)
      .then((buf) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
        setUrl(objectUrl);
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [attachmentId, open]);

  const onResizeDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y: e.clientY, h: height };
  };
  const onResizeMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    updateAttributes({ height: Math.round(Math.min(1600, Math.max(240, drag.current.h + e.clientY - drag.current.y))) });
  };

  return (
    <NodeViewWrapper className="pdf-block" data-selected={selected} contentEditable={false}>
      <div className="pdf-head" data-drag-handle>
        <span className="pdf-icon">
          <FileText size={18} strokeWidth={1.5} />
        </span>
        <span className="pdf-name" dir="auto">
          {name}
        </span>
        <span className="t-label">{formatSize(size)}</span>
        <button type="button" className="icon-btn" onClick={() => updateAttributes({ open: !open })} aria-label={open ? t('editor.pdfHide') : t('editor.pdfShow')}>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {open &&
        (missing ? (
          <div className="pdf-missing t-muted">{t('editor.pdfMissing')}</div>
        ) : (
          <>
            <div className="pdf-frame" style={{ height }}>
              {url ? <iframe src={`${url}#view=FitH`} title={name} /> : <div className="pdf-loading" />}
            </div>
            <div
              className="pdf-resize"
              onPointerDown={onResizeDown}
              onPointerMove={onResizeMove}
              onPointerUp={() => (drag.current = null)}
              role="separator"
              aria-orientation="horizontal"
            />
          </>
        ))}
    </NodeViewWrapper>
  );
}
