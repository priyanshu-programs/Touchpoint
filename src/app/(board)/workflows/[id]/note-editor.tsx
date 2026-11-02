"use client";

import Bold from "@tiptap/extension-bold";
import Document from "@tiptap/extension-document";
import Italic from "@tiptap/extension-italic";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Underline from "@tiptap/extension-underline";
import { CharacterCount, UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon } from "lucide-react";
import { MAX_NOTE_LENGTH } from "@/modules/workflows/drawing";
import { docToNote, noteToDoc } from "@/modules/workflows/note-doc";
import type { NoteMark, NoteStyle } from "@/modules/workflows/note-marks";

export type NoteDraft = { body: string; marks: NoteMark[] };

const BUTTONS: { style: NoteStyle; label: string; key: string; Icon: typeof BoldIcon }[] = [
  { style: "bold", label: "Bold", key: "B", Icon: BoldIcon },
  { style: "italic", label: "Italic", key: "I", Icon: ItalicIcon },
  { style: "underline", label: "Underline", key: "U", Icon: UnderlineIcon },
];

// Writing a note: select words and press Bold, Italic or Underline (or Ctrl+B,
// Ctrl+I, Ctrl+U). What it hands on is only the plain text and where the styles are.
export function NoteEditor({
  initial,
  onChange,
  autoFocus = false,
}: {
  initial: NoteDraft;
  onChange: (draft: NoteDraft) => void;
  autoFocus?: boolean;
}) {
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Bold,
      Italic,
      Underline,
      UndoRedo,
      CharacterCount.configure({ limit: MAX_NOTE_LENGTH }),
    ],
    content: noteToDoc(initial.body, initial.marks),
    immediatelyRender: false,
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Note",
        class:
          "min-h-16 max-h-40 overflow-y-auto px-2.5 py-2 text-base break-words whitespace-pre-wrap outline-none md:text-sm",
      },
    },
    onUpdate: ({ editor: changed }) => onChange(docToNote(changed.getJSON())),
  });
  const active = useEditorState({
    editor,
    selector: ({ editor: shown }) =>
      Object.fromEntries(BUTTONS.map(({ style }) => [style, shown?.isActive(style) ?? false])),
  });

  return (
    <div className="rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
      <div role="toolbar" aria-label="Formatting" className="flex gap-0.5 border-b p-1">
        {BUTTONS.map(({ style, label, key, Icon }) => (
          <button
            key={style}
            type="button"
            aria-label={label}
            aria-pressed={active?.[style] ?? false}
            title={`${label} (Ctrl+${key})`}
            disabled={!editor}
            // Pressing a button keeps the words chosen in the note.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => editor?.chain().focus().toggleMark(style).run()}
            className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-accent aria-pressed:text-foreground"
          >
            <Icon aria-hidden className="size-4" />
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
