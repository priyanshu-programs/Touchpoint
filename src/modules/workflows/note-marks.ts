// A note's formatting is kept apart from its words: the text stays plain, and each
// mark says which characters (as JavaScript counts them) are bold, italic or
// underlined. Nothing in a note is ever HTML.
export const NOTE_STYLES = ["bold", "italic", "underline"] as const;
export type NoteStyle = (typeof NOTE_STYLES)[number];
export type NoteMark = { from: number; to: number; style: NoteStyle };

export const MAX_NOTE_MARKS = 500;

// Marks inside the text, each style's overlapping or touching ranges joined, in
// order of where they start.
export function tidyMarks(marks: readonly NoteMark[], length: number): NoteMark[] {
  const tidy: NoteMark[] = [];
  for (const style of NOTE_STYLES) {
    const ranges = marks
      .filter((mark) => mark.style === style)
      .map(({ from, to }) => ({ from: Math.max(0, from), to: Math.min(length, to) }))
      .filter(({ from, to }) => from < to)
      .sort((a, b) => a.from - b.from);
    let open: NoteMark | null = null;
    for (const { from, to } of ranges) {
      if (open && from <= open.to) open.to = Math.max(open.to, to);
      else tidy.push((open = { from, to, style }));
    }
  }
  return tidy.sort((a, b) => a.from - b.from || NOTE_STYLES.indexOf(a.style) - NOTE_STYLES.indexOf(b.style));
}

// The note with the spaces around it taken off, its marks moved with the words.
export function trimNote(body: string, marks: readonly NoteMark[]) {
  const text = body.trim();
  const lead = body.length - body.trimStart().length;
  return {
    body: text,
    marks: tidyMarks(
      marks.map((mark) => ({ ...mark, from: mark.from - lead, to: mark.to - lead })),
      text.length,
    ),
  };
}

export type NotePiece = { text: string; styles: NoteStyle[] };

// The stretch of text from `from` to `to` cut wherever a mark starts or ends.
export function pieces(
  text: string,
  marks: readonly NoteMark[],
  from = 0,
  to = text.length,
): NotePiece[] {
  const cuts = new Set([from, to]);
  for (const mark of marks) {
    if (mark.from > from && mark.from < to) cuts.add(mark.from);
    if (mark.to > from && mark.to < to) cuts.add(mark.to);
  }
  const at = [...cuts].sort((a, b) => a - b);
  return at.slice(0, -1).flatMap((start, index) => {
    const end = at[index + 1];
    if (start === end) return [];
    const styles = NOTE_STYLES.filter((style) =>
      marks.some((mark) => mark.style === style && mark.from <= start && mark.to >= end),
    );
    return [{ text: text.slice(start, end), styles }];
  });
}
