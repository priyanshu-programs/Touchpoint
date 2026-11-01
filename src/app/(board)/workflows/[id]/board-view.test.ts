import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  boundsOf,
  createViewMemory,
  fittedView,
  openingView,
  rememberView,
} from "./board-view";

const box = (x: number, y: number, width = 100, height = 50) => ({ x, y, width, height });
const SIZE = { width: 1000, height: 800 };

describe("boundsOf", () => {
  it("is nothing for an empty board or only deleted elements", () => {
    expect(boundsOf([])).toBeNull();
    expect(boundsOf([{ ...box(0, 0), isDeleted: true }])).toBeNull();
  });

  it("takes in every element, and a stroke's points that run back past its start", () => {
    expect(
      boundsOf([
        box(10, 20),
        { ...box(500, 500, 0, 0), points: [[0, 0], [-40, 30], [20, -10]] },
      ]),
    ).toEqual({ minX: 10, minY: 20, maxX: 520, maxY: 530 });
  });
});

describe("fittedView", () => {
  it("centres a small drawing at full size, not larger", () => {
    const view = fittedView({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, SIZE);
    expect(view.zoom).toBe(1);
    expect((50 + view.scrollX) * view.zoom).toBe(500);
    expect((50 + view.scrollY) * view.zoom).toBe(400);
  });

  it("shrinks a large drawing to fit with a margin, down to the smallest zoom", () => {
    const large = fittedView({ minX: 0, minY: 0, maxX: 2000, maxY: 1000 }, SIZE);
    expect(large.zoom).toBeCloseTo(0.45);
    const huge = fittedView({ minX: 0, minY: 0, maxX: 1_000_000, maxY: 10 }, SIZE);
    expect(huge.zoom).toBe(0.1);
  });
});

const ID = "board-1";
beforeEach(() => {
  const kept = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => kept.get(key) ?? null,
    setItem: (key: string, value: string) => void kept.set(key, value),
  });
});

describe("openingView", () => {
  it("leaves an empty board alone until the owner has moved it", () => {
    expect(openingView(ID, [], SIZE)).toBeNull();
    const left = { zoom: 2, scrollX: 5, scrollY: 5 };
    rememberView(ID, left);
    expect(openingView(ID, [], SIZE)).toEqual(left);
  });

  it("fits the drawing on a first open", () => {
    expect(openingView(ID, [box(0, 0)], SIZE)?.zoom).toBe(1);
  });

  it("opens where this device left the board", () => {
    const left = { zoom: 2, scrollX: 10, scrollY: 20 };
    rememberView(ID, left);
    expect(openingView(ID, [box(0, 0)], SIZE)).toEqual(left);
    expect(openingView("another-board", [box(0, 0)], SIZE)).not.toEqual(left);
  });

  it("opens at the place left even if it shows none of the drawing", () => {
    const left = { zoom: 2, scrollX: -90_000, scrollY: 0 };
    rememberView(ID, left);
    expect(openingView(ID, [box(0, 0)], SIZE)).toEqual(left);
  });

  it.each([
    "not json",
    "null",
    '{"zoom":0,"scrollX":0,"scrollY":0}',
    '{"zoom":"2","scrollX":0,"scrollY":0}',
    '{"zoom":2,"scrollX":null,"scrollY":0}',
    '{"zoom":1000,"scrollX":0,"scrollY":0}',
  ])("ignores a stored view that is not one: %s", (stored) => {
    localStorage.setItem(`board-view:${ID}`, stored);
    expect(openingView(ID, [box(0, 0)], SIZE)?.zoom).toBe(1);
  });
});

describe("createViewMemory", () => {
  const opened = { zoom: 1, scrollX: 0, scrollY: 0 };
  const moved = { zoom: 2, scrollX: 30, scrollY: 40 };
  const kept = () => openingView(ID, [], SIZE);

  beforeEach(() => void vi.useFakeTimers());
  afterEach(() => void vi.useRealTimers());

  it("does not keep the view a board opened at", () => {
    const memory = createViewMemory(ID);
    expect(memory.saw(opened)).toBe(true);
    expect(memory.saw({ ...opened })).toBe(false);
    vi.runAllTimers();
    memory.write();
    expect(kept()).toBeNull();
  });

  it("keeps a move once the view has stopped", () => {
    const memory = createViewMemory(ID);
    memory.saw(opened);
    expect(memory.saw(moved)).toBe(true);
    expect(kept()).toBeNull();
    vi.advanceTimersByTime(500);
    expect(kept()).toEqual(moved);
  });

  it("keeps a move at once when the page goes, before the wait is over", () => {
    const memory = createViewMemory(ID);
    memory.saw(opened);
    memory.saw(moved);
    memory.write();
    expect(kept()).toEqual(moved);
  });
});
