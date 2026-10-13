import { describe, expect, it } from "vitest";
import { closedShape } from "./sketch";

type Point = [number, number];

// A hand is never exact: every point is nudged by up to `shake`, the same way each run.
const shaky = (points: Point[], shake = 3): Point[] =>
  points.map(([x, y], index) => [
    x + Math.sin(index * 12.9898) * shake,
    y + Math.cos(index * 78.233) * shake,
  ]);

const along = ([fromX, fromY]: Point, [toX, toY]: Point, steps = 20): Point[] =>
  Array.from({ length: steps }, (_, step) => [
    fromX + ((toX - fromX) * step) / steps,
    fromY + ((toY - fromY) * step) / steps,
  ]);

const square = (width: number, height: number): Point[] => [
  ...along([0, 0], [width, 0]),
  ...along([width, 0], [width, height]),
  ...along([width, height], [0, height]),
  ...along([0, height], [0, 8]),
];

const round = (width: number, height: number, turns = 0.97, steps = 80): Point[] =>
  Array.from({ length: steps }, (_, step) => {
    const angle = (turns * 2 * Math.PI * step) / steps;
    return [(width / 2) * Math.cos(angle), (height / 2) * Math.sin(angle)];
  });

describe("closedShape", () => {
  it("takes a drawn box for a box", () => {
    expect(closedShape(shaky(square(200, 120)))).toBe("rectangle");
    expect(closedShape(shaky(square(90, 240)))).toBe("rectangle");
  });

  it("takes a drawn circle or oval for a circle", () => {
    expect(closedShape(shaky(round(160, 160)))).toBe("ellipse");
    expect(closedShape(shaky(round(260, 110)))).toBe("ellipse");
  });

  it("takes either way round", () => {
    expect(closedShape(shaky(square(200, 120)).reverse())).toBe("rectangle");
    expect(closedShape(shaky(round(160, 160)).reverse())).toBe("ellipse");
  });

  it.each([
    ["a line", along([0, 0], [300, 40], 40)],
    ["a curve left open", round(200, 200, 0.6)],
    [
      "a zigzag that ends where it began",
      [
        ...along([0, 0], [200, 100]),
        ...along([200, 100], [0, 100]),
        ...along([0, 100], [200, 0]),
        ...along([200, 0], [0, 4]),
      ],
    ],
    ["a circle gone round twice", round(160, 160, 2, 160)],
    ["a dot", Array.from({ length: 12 }, (): Point => [5, 5])],
    ["a few points", round(100, 100, 0.97, 5)],
    ["no points", []],
  ])("makes nothing of %s", (_label, points) => {
    expect(closedShape(points)).toBeNull();
  });

  it("is quick on a long stroke", () => {
    const started = performance.now();
    expect(closedShape(round(400, 300, 0.99, 10_000))).toBe("ellipse");
    expect(performance.now() - started).toBeLessThan(50);
  });
});
