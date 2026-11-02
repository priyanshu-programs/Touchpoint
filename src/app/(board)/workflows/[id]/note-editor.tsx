"use client";

import Bold from "@tiptap/extension-bold";
import Document from "@tiptap/extension-document";
import Italic from "@tiptap/extension-italic";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Underline from "@tiptap/extension-underline";
import { Extension } from "@tiptap/core";
import { CharacterCount, UndoRedo } from "@tiptap/extensions";
import type { Node as ProseNode } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { Bold as BoldIcon, Italic as ItalicIcon, Underline as UnderlineIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { linkParts } from "@/lib/autolink";
import { MAX_NOTE_LENGTH } from "@/modules/workflows/drawing";
import { docToNote, noteToDoc } from "@/modules/workflows/note-doc";
import type { NoteMark, NoteStyle } from "@/modules/workflows/note-marks";

export type NoteDraft = { body: string; marks: NoteMark[] };

const BUTTONS: { style: NoteStyle; label: string; key: string; Icon: typeof BoldIcon }[] = [
  { style: "bold", label: "Bold", key: "B", Icon: BoldIcon },
  { style: "italic", label: "Italic", key: "I", Icon: ItalicIcon },
  { style: "underline", label: "Underline", key: "U", Icon: UnderlineIcon },
];

// The addresses in one line of the note, by their places in the document.
function addressesIn(line: ProseNode, start: number) {
  let at = start;
  return linkParts(line.textContent).flatMap(({ text, href }) => {
    const from = at;
    at += text.length;
    return href ? [{ from, to: at, href }] : [];
  });
}

// Addresses look like links while the note is written, but stay plain text in it:
// a click places the cursor, and Ctrl+click (Cmd+click) opens the address.
const Addresses = Extension.create({
  name: "addresses",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations: ({ doc }) => {
            const found: Decoration[] = [];
            doc.descendants((node, pos) => {
              if (!node.isTextblock) return true;
              for (const { from, to, href } of addressesIn(node, pos + 1))
                found.push(
                  Decoration.inline(from, to, {
                    class: "text-blue-600 underline underline-offset-2 dark:text-blue-400",
                    "data-href": href,
                    title: "Ctrl+click to open",
                  }),
                );
              return false;
            });
            return DecorationSet.create(doc, found);
          },
          handleClick: (view, pos, event) => {
            if (!event.ctrlKey && !event.metaKey) return false;
            const place = view.state.doc.resolve(pos);
            const link = addressesIn(place.parent, place.start()).find(
              ({ from, to }) => pos >= from && pos <= to,
            );
            if (!link) return false;
            window.open(link.href, "_blank", "noopener,noreferrer");
            return true;
          },
        },
      }),
    ];
  },
});

// Writing a note: select words and press Bold, Italic or Underline (or Ctrl+B,
// Ctrl+I, Ctrl+U). What it hands on is only the plain text and where the styles are.
export function NoteEditor({
  initial,
  onChange,
  autoFocus = false,
  fill = false,
}: {
  initial: NoteDraft;
  onChange: (draft: NoteDraft) => void;
  autoFocus?: boolean;
  // Grows with the note, its formatting buttons kept at the top while it scrolls.
  fill?: boolean;
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
      Addresses,
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
        class: cn(
          "px-2.5 py-2 text-base break-words whitespace-pre-wrap outline-none md:text-sm",
          fill ? "min-h-40" : "min-h-16 max-h-40 overflow-y-auto",
        ),
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
      <div
        role="toolbar"
        aria-label="Formatting"
        className={cn(
          "flex gap-0.5 border-b p-1",
          fill && "sticky top-0 z-10 rounded-t-lg bg-popover",
        )}
      >
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
