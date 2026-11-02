import type { JSONContent } from "@tiptap/core";
import { NOTE_STYLES, pieces, tidyMarks, type NoteMark, type NoteStyle } from "./note-marks";

// The note editor's document: one paragraph a line, with bold, italic and
// underline as marks on its text. Only the plain text and the marks are kept.
export function noteToDoc(body: string, marks: readonly NoteMark[]): JSONContent {
  let at = 0;
  return {
    type: "doc",
    content: body.split("\n").map((line) => {
      const from = at;
      at += line.length + 1;
      if (!line) return { type: "paragraph" };
      return {
        type: "paragraph",
        content: pieces(body, marks, from, from + line.length).map(({ text, styles }) => ({
          type: "text",
          text,
          ...(styles.length > 0 && { marks: styles.map((type) => ({ type })) }),
        })),
      };
    }),
  };
}

const isStyle = (type: string): type is NoteStyle =>
  (NOTE_STYLES as readonly string[]).includes(type);

export function docToNote(doc: JSONContent): { body: string; marks: NoteMark[] } {
  const marks: NoteMark[] = [];
  let body = "";
  (doc.content ?? []).forEach((paragraph, index) => {
    if (index > 0) body += "\n";
    for (const node of paragraph.content ?? []) {
      const text = node.text ?? "";
      for (const { type } of node.marks ?? []) {
        if (isStyle(type)) marks.push({ from: body.length, to: body.length + text.length, style: type });
      }
      body += text;
    }
  });
  return { body, marks: tidyMarks(marks, body.length) };
}
