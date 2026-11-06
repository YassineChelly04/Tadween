import type { Editor, Range } from '@tiptap/core';
import {
  ChevronRight,
  Columns2,
  Columns3,
  Columns4,
  FilePlus2,
  FileText,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  List,
  ListChecks,
  ListOrdered,
  Mic,
  Minus,
  PanelTop,
  Quote,
  Table as TableIcon,
  Type,
  type LucideIcon,
} from 'lucide-react';
import i18n from '../../i18n';
import { api, ApiError } from '../../lib/api';
import { fold } from '../../lib/fold';
import { useApp } from '../../store';
import { toast } from '../../components/Dialogs';
import { turnInto, type TurnTarget } from './turnInto';
import { askForFile, fromKeyboard } from './FilePrompt';
import { useDictation } from './useDictation';

export type BlockId =
  | 'text'
  | 'page'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'numbered'
  | 'todo'
  | 'toggle'
  | 'quote'
  | 'callout'
  | 'divider'
  | 'code'
  | 'table'
  | 'image'
  | 'pdf'
  | 'columns2'
  | 'columns3'
  | 'columns4'
  | 'dictate';

export interface BlockDef {
  id: BlockId;
  icon: LucideIcon;
  group: 'basic' | 'lists' | 'media' | 'layout';
  /** Extra search words, in all three languages. */
  keywords: string[];
  /** Offered in "Turn into". */
  convertible: boolean;
  run: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
}

/** Runs a conversion; a structure it cannot build is reported, never thrown at the editor. */
function turn(editor: Editor, target: TurnTarget) {
  try {
    if (!turnInto(editor, target)) toast(i18n.t('editor.cannotTurn'));
  } catch {
    toast(i18n.t('editor.cannotTurn'));
  }
}

function fileError(e: unknown) {
  const tooLarge = e instanceof ApiError && e.code === 'invalid';
  toast(i18n.t(tooLarge ? 'editor.fileTooLarge' : 'common.error'));
}

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Same limit as MAX_ATTACHMENT_BYTES in src-tauri/src/vault.rs. */
const MAX_PDF_BYTES = 100 * 1024 * 1024;

/**
 * The webview's own file chooser. The native one (a modal loop on the window's
 * UI thread) left WebView2 unable to draw the mouse pointer over the dialog;
 * Chromium runs its chooser off that thread, so the pointer stays visible.
 */
function chooseFiles(accept: string): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = true;
    input.style.display = 'none';
    const done = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener('change', () => done([...(input.files ?? [])]));
    input.addEventListener('cancel', () => done([]));
    document.body.append(input);
    input.click();
  });
}

export function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read')));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function insertImages(editor: Editor) {
  const files = await chooseFiles('image/png,image/jpeg,image/gif,image/webp,image/bmp,image/svg+xml,image/avif');
  for (const f of files) {
    if (f.size > MAX_IMAGE_BYTES) {
      toast(i18n.t('editor.imageTooLarge'));
      continue;
    }
    try {
      editor.chain().focus().setImage({ src: await readDataUrl(f), alt: f.name }).run();
    } catch (e) {
      fileError(e);
    }
  }
}

export async function insertPdfs(editor: Editor) {
  const files = await chooseFiles('application/pdf,.pdf');
  for (const f of files) {
    if (f.size > MAX_PDF_BYTES) {
      toast(i18n.t('editor.fileTooLarge'));
      continue;
    }
    try {
      const attachmentId = await api.addAttachment(new Uint8Array(await f.arrayBuffer()));
      editor.chain().focus().insertPdf({ attachmentId, name: f.name, size: f.size }).run();
    } catch (e) {
      fileError(e);
    }
  }
}

/** Writes a new page into the one on screen, then opens it. */
async function addSubPage(editor: Editor) {
  const { view, createSubPage, open } = useApp.getState();
  if (view.kind !== 'page') return;
  try {
    const id = await createSubPage(view.id);
    editor.chain().focus().insertPageLink(id).run();
    open({ kind: 'page', id });
  } catch {
    toast(i18n.t('common.error'));
  }
}

export const BLOCKS: BlockDef[] = [
  {
    id: 'text',
    icon: Type,
    group: 'basic',
    keywords: ['paragraph', 'plain', 'texte', 'paragraphe', 'نص', 'فقرة'],
    convertible: true,
    run: (e) => turn(e, 'text'),
    isActive: (e) =>
      e.isActive('paragraph') && !['bulletList', 'orderedList', 'taskList', 'blockquote', 'callout'].some((n) => e.isActive(n)),
  },
  {
    id: 'page',
    icon: FilePlus2,
    group: 'basic',
    keywords: ['page', 'subpage', 'sub-page', 'nested', 'sous-page', 'صفحة', 'فرعية'],
    convertible: false,
    run: (e) => void addSubPage(e),
  },
  {
    id: 'h1',
    icon: Heading1,
    group: 'basic',
    keywords: ['h1', 'heading', 'title', 'titre', 'عنوان'],
    convertible: true,
    run: (e) => turn(e, 'h1'),
    isActive: (e) => e.isActive('heading', { level: 1 }),
  },
  {
    id: 'h2',
    icon: Heading2,
    group: 'basic',
    keywords: ['h2', 'heading', 'subtitle', 'titre', 'عنوان'],
    convertible: true,
    run: (e) => turn(e, 'h2'),
    isActive: (e) => e.isActive('heading', { level: 2 }),
  },
  {
    id: 'h3',
    icon: Heading3,
    group: 'basic',
    keywords: ['h3', 'heading', 'titre', 'عنوان'],
    convertible: true,
    run: (e) => turn(e, 'h3'),
    isActive: (e) => e.isActive('heading', { level: 3 }),
  },
  {
    id: 'bullet',
    icon: List,
    group: 'lists',
    keywords: ['ul', 'bullet', 'list', 'puces', 'liste', 'قائمة', 'نقطية'],
    convertible: true,
    run: (e) => turn(e, 'bullet'),
    isActive: (e) => e.isActive('bulletList'),
  },
  {
    id: 'numbered',
    icon: ListOrdered,
    group: 'lists',
    keywords: ['ol', 'numbered', 'ordered', 'numérotée', 'liste', 'مرقمة', 'قائمة'],
    convertible: true,
    run: (e) => turn(e, 'numbered'),
    isActive: (e) => e.isActive('orderedList'),
  },
  {
    id: 'todo',
    icon: ListChecks,
    group: 'lists',
    keywords: ['todo', 'task', 'check', 'checkbox', 'tâche', 'cocher', 'مهام', 'مهمة'],
    convertible: true,
    run: (e) => turn(e, 'todo'),
    isActive: (e) => e.isActive('taskList'),
  },
  {
    id: 'toggle',
    icon: ChevronRight,
    group: 'lists',
    keywords: ['toggle', 'details', 'collapse', 'dépliable', 'bascule', 'طي'],
    convertible: true,
    run: (e) => turn(e, 'toggle'),
    isActive: (e) => e.isActive('detailsSummary'),
  },
  {
    id: 'quote',
    icon: Quote,
    group: 'basic',
    keywords: ['quote', 'blockquote', 'citation', 'اقتباس'],
    convertible: true,
    run: (e) => turn(e, 'quote'),
    isActive: (e) => e.isActive('blockquote'),
  },
  {
    id: 'callout',
    icon: PanelTop,
    group: 'basic',
    keywords: ['callout', 'note', 'info', 'encadré', 'ملاحظة'],
    convertible: true,
    run: (e) => turn(e, 'callout'),
    isActive: (e) => e.isActive('callout'),
  },
  {
    id: 'code',
    icon: Code2,
    group: 'media',
    keywords: ['code', 'snippet', 'pre', 'شيفرة', 'كود'],
    convertible: true,
    run: (e) => turn(e, 'code'),
    isActive: (e) => e.isActive('codeBlock'),
  },
  {
    id: 'divider',
    icon: Minus,
    group: 'media',
    keywords: ['hr', 'divider', 'separator', 'line', 'séparateur', 'فاصل', 'خط'],
    convertible: false,
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    id: 'table',
    icon: TableIcon,
    group: 'media',
    keywords: ['table', 'grid', 'tableau', 'جدول'],
    convertible: false,
    run: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: 'image',
    icon: ImageIcon,
    group: 'media',
    keywords: ['image', 'picture', 'photo', 'img', 'صورة'],
    convertible: false,
    run: (e) => (fromKeyboard() ? askForFile('image') : void insertImages(e)),
  },
  {
    id: 'pdf',
    icon: FileText,
    group: 'media',
    keywords: ['pdf', 'file', 'document', 'fichier', 'ملف', 'مستند'],
    convertible: false,
    run: (e) => (fromKeyboard() ? askForFile('pdf') : void insertPdfs(e)),
  },
  {
    id: 'columns2',
    icon: Columns2,
    group: 'layout',
    keywords: ['columns', 'colonnes', 'two', 'deux', 'أعمدة', 'عمودان', 'layout'],
    convertible: false,
    run: (e) => e.chain().focus().insertColumns(2).run(),
  },
  {
    id: 'columns3',
    icon: Columns3,
    group: 'layout',
    keywords: ['columns', 'colonnes', 'three', 'trois', 'أعمدة', 'layout'],
    convertible: false,
    run: (e) => e.chain().focus().insertColumns(3).run(),
  },
  {
    id: 'columns4',
    icon: Columns4,
    group: 'layout',
    keywords: ['columns', 'colonnes', 'four', 'quatre', 'أعمدة', 'layout'],
    convertible: false,
    run: (e) => e.chain().focus().insertColumns(4).run(),
  },
  {
    id: 'dictate',
    icon: Mic,
    group: 'media',
    keywords: ['dictate', 'dictation', 'voice', 'speech', 'microphone', 'dictée', 'voix', 'إملاء', 'صوت'],
    convertible: false,
    run: () => void useDictation.getState().start(),
  },
];

export function blockLabel(id: BlockId): [string, string] {
  return i18n.t(`editor.blocks.${id}`, { returnObjects: true }) as unknown as [string, string];
}

export function filterBlocks(query: string): BlockDef[] {
  const q = fold(query.trim());
  if (!q) return BLOCKS;
  return BLOCKS.filter((b) => {
    const [label] = blockLabel(b.id);
    const english = i18n.getFixedT('en')(`editor.blocks.${b.id}`, { returnObjects: true }) as unknown as string[];
    return [label, english[0], ...b.keywords].some((w) => fold(w).includes(q));
  });
}

/** Runs a block from the slash menu: removes the typed "/query" first. */
export function runFromSlash(editor: Editor, range: Range, block: BlockDef) {
  editor.chain().focus().deleteRange(range).run();
  block.run(editor);
}
