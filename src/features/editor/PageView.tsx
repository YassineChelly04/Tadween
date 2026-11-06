import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Trash2 } from 'lucide-react';
import { api, ApiError, type Note, type NotePatch } from '../../lib/api';
import { childrenOf } from '../../lib/pages';
import { enqueue, registerFlush } from '../../lib/saveQueue';
import { useApp } from '../../store';
import { createExtensions } from './extensions';
import { BubbleToolbar } from './BubbleToolbar';
import { BlockHandle } from './BlockHandle';
import { directionKey } from './direction';
import { Properties } from './Properties';
import { TableControls } from './TableControls';
import { FilePrompt } from './FilePrompt';
import { DictationBar } from './DictationStrip';
import { MAX_IMAGE_BYTES, insertImages as chooseImages, insertPdfs as choosePdfs, readDataUrl } from './blocks';
import { PageRow } from './pageLink';
import { PageTopBar } from '../shell/TopBar';
import { relativeTime } from '../../lib/time';
import { confirmDialog, toast } from '../../components/Dialogs';
import { PageIcon } from '../../components/icons/PageIcon';
import { IconPicker } from '../../components/icons/IconPicker';

const SAVE_DELAY = 450;

export type SaveState = 'saved' | 'saving' | 'failed';

function readImage(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/') || file.size > MAX_IMAGE_BYTES) return Promise.resolve(null);
  return readDataUrl(file).catch(() => null);
}

export function PageView({ id }: { id: string }) {
  const [note, setNote] = useState<Note | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    setNote(null);
    setMissing(false);
    api
      .getNote(id)
      .then((n) => alive && setNote(n))
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [id]);

  if (missing) return <PageMissing />;
  if (!note) return <div className="page-loading" />;
  return <PageEditor key={note.id} note={note} />;
}

/** A link to a page that is gone: say so, and offer the way back. */
function PageMissing() {
  const { t } = useTranslation();
  const open = useApp((s) => s.open);
  return (
    <div className="page">
      <div className="crash">
        <p>{t('page.notFound')}</p>
        <button className="btn btn-ghost" onClick={() => open({ kind: 'home' })}>
          {t('home.title')}
        </button>
      </div>
    </div>
  );
}

function PageEditor({ note }: { note: Note }) {
  const { t, i18n } = useTranslation();
  const upsertSummary = useApp((s) => s.upsertSummary);
  const summary = useApp((s) => s.notes.find((n) => n.id === note.id));
  const restore = useApp((s) => s.restore);
  const deleteForever = useApp((s) => s.deleteForever);
  const language = useApp((s) => s.prefs.language);

  const [title, setTitle] = useState(note.title);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const pending = useRef<NotePatch & { body?: boolean }>({});
  const timer = useRef<number>(undefined);
  const warned = useRef(false);
  const editorRef = useRef<Editor | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  // The list is the live truth; the note was read when the page opened.
  const trashed = summary ? summary.trashedAt !== null : note.trashedAt !== null;

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const { body, ...patch } = pending.current;
    pending.current = {};
    const editor = editorRef.current;
    if (body && editor && !editor.isDestroyed) {
      patch.content = editor.getJSON();
      patch.text = editor.getText({ blockSeparator: '\n' });
    }
    if (!Object.keys(patch).length) return;
    setSaveState('saving');
    void enqueue(() => api.updateNote(note.id, patch))
      .then((s) => {
        upsertSummary(s);
        warned.current = false;
        setSaveState(Object.keys(pending.current).length ? 'saving' : 'saved');
      })
      .catch((e: unknown) => {
        // Keep what did not reach the disk: the next edit or flush tries again.
        const code = e instanceof ApiError ? e.code : 'io';
        if (code === 'locked') return;
        pending.current = { ...patch, ...pending.current, ...(body ? { body: true } : {}) };
        delete pending.current.content;
        delete pending.current.text;
        setSaveState('failed');
        if (!warned.current) toast(t(code === 'invalid' ? 'page.tooLarge' : 'page.saveFailed'));
        warned.current = true;
      });
  }, [note.id, upsertSummary, t]);

  const schedule = useCallback(
    (patch: NotePatch & { body?: boolean }) => {
      Object.assign(pending.current, patch);
      setSaveState((was) => (was === 'failed' ? was : 'saving'));
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(flush, SAVE_DELAY);
    },
    [flush],
  );

  useEffect(() => registerFlush(flush), [flush]);
  useEffect(() => () => flush(), [flush]);

  const extensions = useMemo(() => createExtensions(language === 'ar' ? 'rtl' : 'ltr'), []);

  const insertImages = useCallback(async (files: File[], editor: Editor, at?: number) => {
    for (const file of files) {
      const src = await readImage(file);
      if (!src) {
        if (file.size > MAX_IMAGE_BYTES) toast(t('editor.imageTooLarge'));
        continue;
      }
      const chain = editor.chain().focus();
      if (at !== undefined) chain.insertContentAt(at, { type: 'image', attrs: { src } }).run();
      else chain.setImage({ src }).run();
    }
  }, [t]);

  const editor = useEditor(
    {
      extensions,
      content: note.content,
      editable: !trashed,
      autofocus: false,
      editorProps: {
        attributes: { class: 'tw-editor', spellcheck: 'true' },
        // Links stay editable text; Ctrl+click follows them.
        handleClick: (_view, _pos, event) => {
          const href = (event.target as HTMLElement).closest('a[href]')?.getAttribute('href');
          if (!href || !(event.ctrlKey || event.metaKey)) return false;
          void api.openLink(href);
          return true;
        },
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'));
          if (!files.length || !editorRef.current) return false;
          void insertImages(files, editorRef.current);
          return true;
        },
        handleDrop: (view, event, _slice, moved) => {
          if (moved) return false;
          const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith('image/'));
          if (!files.length || !editorRef.current) return false;
          const at = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          void insertImages(files, editorRef.current, at);
          return true;
        },
      },
      onUpdate: () => schedule({ body: true }),
    },
    [note.id],
  );

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // The interface language only decides where an empty page's caret starts.
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      editor.view.dispatch(editor.state.tr.setMeta(directionKey, language === 'ar' ? 'rtl' : 'ltr'));
    }
  }, [editor, language]);

  useEffect(() => {
    editor?.setEditable(!trashed);
  }, [editor, trashed]);

  // New, empty page: start in the title. A new journal entry already has its
  // date as a title, so it starts in the body.
  useEffect(() => {
    if (trashed || note.text) return;
    if (!note.title) titleRef.current?.focus();
    else if (editor) {
      editor.commands.setTextSelection(1);
      editor.view.focus();
    }
  }, [note.title, note.text, trashed, editor]);

  // First page ever opened: a short tour of the page.
  useEffect(() => {
    if (trashed) return;
    const id = window.setTimeout(() => useApp.getState().startTour('page'), 700);
    return () => window.clearTimeout(id);
  }, [trashed]);

  useLayoutEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  const words = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? (e.storage.characterCount?.words?.() as number) ?? 0 : 0),
  });

  const onTitle = (value: string) => {
    const clean = value.replace(/\n/g, ' ');
    setTitle(clean);
    if (summary) upsertSummary({ ...summary, title: clean });
    schedule({ title: clean });
  };

  const onTitleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const atEnd = el.selectionStart === el.value.length && el.selectionEnd === el.value.length;
    if ((e.key === 'Enter' && !e.nativeEvent.isComposing) || (e.key === 'ArrowDown' && atEnd)) {
      e.preventDefault();
      if (!editor) return;
      // Move focus now, not on the next frame, so fast typing lands in the body.
      editor.commands.setTextSelection(1);
      editor.view.focus();
    }
  };

  const updatedAt = summary?.updatedAt ?? note.updatedAt;

  return (
    <div className="page">
      <PageTopBar noteId={note.id} title={title} saveState={saveState} />

      <div className="page-scroll">
        {trashed && (
          <div className="trash-banner">
            <span>{t('page.inTrash')}</span>
            <div className="trash-banner-actions">
              <button className="btn btn-ghost" onClick={() => void restore(note.id)}>
                <RotateCcw size={15} strokeWidth={1.5} />
                {t('page.restore')}
              </button>
              <button
                className="btn btn-danger"
                onClick={async () => {
                  if (await confirmDialog(t('page.deleteConfirm'), { confirmLabel: t('page.deleteForever'), danger: true })) {
                    void deleteForever(note.id);
                  }
                }}
              >
                <Trash2 size={15} strokeWidth={1.5} />
                {t('page.deleteForever')}
              </button>
            </div>
          </div>
        )}

        <article className="page-body" ref={setHost}>
          <PageIconRow noteId={note.id} value={summary?.icon ?? note.icon ?? null} readOnly={trashed} />
          <textarea
            ref={titleRef}
            data-tour="page-title"
            className="page-title t-display"
            dir="auto"
            rows={1}
            value={title}
            readOnly={trashed}
            placeholder={t('editor.titlePlaceholder')}
            spellCheck
            onChange={(e) => onTitle(e.target.value)}
            onKeyDown={onTitleKey}
          />
          <div className="page-meta t-label">
            <span>{t('page.edited', { time: relativeTime(updatedAt, i18n.language) })}</span>
            <span aria-hidden="true">·</span>
            <span>{t('page.words', { count: words })}</span>
          </div>
          <Properties noteId={note.id} readOnly={trashed} />

          {editor && (
            <>
              <EditorContent editor={editor} className="editor-host" data-tour="page-editor" />
              {!trashed && <BubbleToolbar editor={editor} />}
              {!trashed && <BlockHandle editor={editor} />}
              {!trashed && <TableControls editor={editor} host={host} />}
              {!trashed && <FilePrompt editor={editor} choose={(kind) => void (kind === 'image' ? chooseImages(editor) : choosePdfs(editor))} />}
              <PagesInside noteId={note.id} editor={editor} />
            </>
          )}
        </article>
      </div>

      {editor && !trashed && <DictationBar editor={editor} />}
    </div>
  );
}

/** Pages inside this one that its text does not show, so none is ever out of reach. */
function PagesInside({ noteId, editor }: { noteId: string; editor: Editor }) {
  const { t } = useTranslation();
  const notes = useApp((s) => s.notes);
  const linked = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const ids: string[] = [];
      e.state.doc.descendants((node) => {
        if (node.type.name === 'pageLink') ids.push(node.attrs.pageId as string);
      });
      return ids.join(',');
    },
  });
  const rest = useMemo(() => {
    const shown = new Set(linked.split(','));
    return childrenOf(notes, noteId).filter((n) => !shown.has(n.id));
  }, [notes, noteId, linked]);
  if (!rest.length) return null;
  return (
    <section className="pages-inside">
      <h2 className="t-label">{t('page.inside')}</h2>
      {rest.map((n) => (
        <PageRow key={n.id} id={n.id} />
      ))}
    </section>
  );
}

/** The page's icon above its title; "Add icon" shows on hover when there is none. */
function PageIconRow({ noteId, value, readOnly }: { noteId: string; value: string | null; readOnly: boolean }) {
  const { t } = useTranslation();
  const patchNote = useApp((s) => s.patchNote);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (readOnly && !value) return null;
  return (
    <div className="page-icon-row">
      {value ? (
        <button className="page-icon-btn" aria-label={t('icons.change')} title={t('icons.change')} disabled={readOnly} onMouseDown={(e) => e.stopPropagation()} onClick={() => setOpen((o) => !o)}>
          <PageIcon value={value} size={48} />
        </button>
      ) : (
        <button className="page-icon-add t-label" aria-expanded={open} onMouseDown={(e) => e.stopPropagation()} onClick={() => setOpen((o) => !o)}>
          {t('icons.add')}
        </button>
      )}
      {open && <IconPicker value={value} onChange={(icon) => void patchNote(noteId, { icon })} onClose={close} />}
    </div>
  );
}
