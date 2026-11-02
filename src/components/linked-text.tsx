import { Fragment, type ReactNode } from "react";
import { linkParts } from "@/lib/autolink";
import { pieces, type NoteMark, type NoteStyle } from "@/modules/workflows/note-marks";

function styled(text: string, styles: readonly NoteStyle[]) {
  let shown: ReactNode = text;
  if (styles.includes("underline")) shown = <u>{shown}</u>;
  if (styles.includes("italic")) shown = <em>{shown}</em>;
  if (styles.includes("bold")) shown = <strong>{shown}</strong>;
  return shown;
}

// Only for text the owner typed: a stranger's text (a fetched page, an email) stays plain.
// `marks` makes some of it bold, italic or underlined, as React elements, never HTML.
export function LinkedText({ text, marks = [] }: { text: string; marks?: readonly NoteMark[] }) {
  const parts = linkParts(text);
  const starts = parts.map((_, index) =>
    parts.slice(0, index).reduce((sum, { text: part }) => sum + part.length, 0),
  );
  return parts.map(({ text: part, href }, index) => {
    const from = starts[index];
    const shown =
      marks.length === 0
        ? part
        : pieces(text, marks, from, from + part.length).map((piece, at) => (
            <Fragment key={at}>{styled(piece.text, piece.styles)}</Fragment>
          ));
    return href ? (
      <a
        key={index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline underline-offset-2 dark:text-blue-400"
      >
        {shown}
      </a>
    ) : (
      <Fragment key={index}>{shown}</Fragment>
    );
  });
}
