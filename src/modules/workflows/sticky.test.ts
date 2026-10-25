import { describe, expect, it } from "vitest";
import { sameNotes, stickyNotes, unmarkedSticky, writingOnNote } from "./sticky";

const note = (id: string, x: number, extra: object = {}) => ({
  id,
  version: 1,
  type: "rectangle",
  isDeleted: false,
  x,
  y: 0,
  width: 200,
  height: 200,
  angle: 0,
  customData: { sticky: true },
  ...extra,
});

const seen = { x: 0, y: 0, width: 1000, height: 800 };

describe("stickyNotes", () => {
  it("lists the marked notes on the screen and near its edge", () => {
    const notes = stickyNotes(
      [
        note("on", 100),
        note("edge", -220),
        note("far", 3000),
        note("gone", 100, { isDeleted: true }),
        note("box", 100, { customData: null }),
        note("stage", 100, { customData: { stage: { status: "done" } } }),
      ],
      seen,
    );
    expect(notes.map(({ id }) => id)).toEqual(["on", "edge"]);
    expect(notes[0]).toEqual({ id: "on", version: 1, x: 100, y: 0, width: 200, height: 200, angle: 0 });
  });
});

describe("writingOnNote", () => {
  it("is true only for text being written inside a note", () => {
    const drawing = [note("a", 0), note("b", 300, { customData: null })];
    expect(writingOnNote(drawing, { id: "t", containerId: "a" })).toBe(true);
    expect(writingOnNote(drawing, { id: "t", containerId: "b" })).toBe(false);
    expect(writingOnNote(drawing, { id: "t", containerId: null })).toBe(false);
    expect(writingOnNote(drawing, null)).toBe(false);
  });
});

describe("sameNotes", () => {
  it("tells a note moved or changed from one left alone", () => {
    const before = stickyNotes([note("a", 0)], seen);
    expect(sameNotes(before, stickyNotes([note("a", 0)], seen))).toBe(true);
    expect(sameNotes(before, stickyNotes([note("a", 10, { version: 2 })], seen))).toBe(false);
    expect(sameNotes(before, [])).toBe(false);
  });
});

describe("unmarkedSticky", () => {
  const old = {
    type: "rectangle",
    isDeleted: false,
    strokeColor: "transparent",
    backgroundColor: "#fff3a3",
    fillStyle: "solid",
    roundness: { type: 3 },
    customData: undefined,
  };

  it("finds a note put down before notes were marked", () => {
    expect(unmarkedSticky(old)).toBe(true);
    expect(unmarkedSticky({ ...old, backgroundColor: "#fa5252" })).toBe(true);
  });

  it("leaves boxes that are not notes, and notes already marked", () => {
    expect(unmarkedSticky({ ...old, strokeColor: "#1e1e1e" })).toBe(false);
    expect(unmarkedSticky({ ...old, backgroundColor: "#123456" })).toBe(false);
    expect(unmarkedSticky({ ...old, fillStyle: "hachure" })).toBe(false);
    expect(unmarkedSticky({ ...old, roundness: null })).toBe(false);
    expect(unmarkedSticky({ ...old, type: "ellipse" })).toBe(false);
    expect(unmarkedSticky({ ...old, isDeleted: true })).toBe(false);
    expect(unmarkedSticky({ ...old, customData: { sticky: true } })).toBe(false);
  });
});
