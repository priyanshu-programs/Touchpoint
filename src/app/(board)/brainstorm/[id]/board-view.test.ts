import { beforeEach, describe, expect, it, vi } from "vitest";
import { boundsOf, fittedView, openingView, rememberView } from "./board-view";

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

describe("openingView", () => {
  const ID = "board-1";
  beforeEach(() => {
    const kept = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => kept.get(key) ?? null,
      setItem: (key: string, value: string) => void kept.set(key, value),
    });
  });

  it("leaves an empty board alone", () => {
    rememberView(ID, { zoom: 2, scrollX: 5, scrollY: 5 });
    expect(openingView(ID, [], SIZE)).toBeNull();
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

  it("fits the drawing when the place left shows none of it", () => {
    rememberView(ID, { zoom: 2, scrollX: -90_000, scrollY: 0 });
    expect(openingView(ID, [box(0, 0)], SIZE)?.scrollX).toBe(450);
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
