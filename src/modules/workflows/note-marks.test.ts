import { describe, expect, it } from "vitest";
import { docToNote, noteToDoc } from "./note-doc";
import { pieces, tidyMarks, trimNote } from "./note-marks";

describe("tidyMarks", () => {
  it("cuts marks to the text and orders them by where they start", () => {
    expect(
      tidyMarks(
        [
          { from: 4, to: 99, style: "italic" },
          { from: -3, to: 2, style: "bold" },
          { from: 8, to: 8, style: "underline" },
        ],
        6,
      ),
    ).toEqual([
      { from: 0, to: 2, style: "bold" },
      { from: 4, to: 6, style: "italic" },
    ]);
  });

  it("joins touching marks of one style and keeps other styles apart", () => {
    expect(
      tidyMarks(
        [
          { from: 0, to: 2, style: "bold" },
          { from: 2, to: 4, style: "bold" },
          { from: 1, to: 3, style: "italic" },
        ],
        10,
      ),
    ).toEqual([
      { from: 0, to: 4, style: "bold" },
      { from: 1, to: 3, style: "italic" },
    ]);
  });
});

describe("trimNote", () => {
  it("drops marks that only covered the spaces", () => {
    expect(trimNote("  hi  ", [{ from: 0, to: 2, style: "bold" }])).toEqual({
      body: "hi",
      marks: [],
    });
  });
});

describe("pieces", () => {
  const marks = [
    { from: 0, to: 5, style: "bold" },
    { from: 3, to: 9, style: "italic" },
  ] as const;

  it("cuts the text wherever a style starts or stops", () => {
    expect(pieces("Quote sent today", marks)).toEqual([
      { text: "Quo", styles: ["bold"] },
      { text: "te", styles: ["bold", "italic"] },
      { text: " sen", styles: ["italic"] },
      { text: "t today", styles: [] },
    ]);
  });

  it("cuts only a stretch of the text when asked", () => {
    expect(pieces("Quote sent today", marks, 4, 7)).toEqual([
      { text: "e", styles: ["bold", "italic"] },
      { text: " s", styles: ["italic"] },
    ]);
  });

  it("gives plain text as one piece", () => {
    expect(pieces("plain", [])).toEqual([{ text: "plain", styles: [] }]);
  });
});

describe("noteToDoc and docToNote", () => {
  const note = {
    body: "Quote sent\n\nwaiting on Maple Studio",
    marks: [
      { from: 0, to: 5, style: "bold" as const },
      { from: 3, to: 8, style: "italic" as const },
      { from: 23, to: 35, style: "underline" as const },
    ],
  };

  it("give back the same words, line breaks and formatting", () => {
    expect(docToNote(noteToDoc(note.body, note.marks))).toEqual(note);
  });

  it("make a line with nothing on it an empty paragraph", () => {
    expect(noteToDoc("a\n\nb", []).content?.[1]).toEqual({ type: "paragraph" });
  });

  it("keep only the three styles", () => {
    expect(
      docToNote({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "hi", marks: [{ type: "link" }, { type: "bold" }] }],
          },
        ],
      }),
    ).toEqual({ body: "hi", marks: [{ from: 0, to: 2, style: "bold" }] });
  });
});
