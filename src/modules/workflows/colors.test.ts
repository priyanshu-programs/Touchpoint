import { describe, expect, it } from "vitest";
import { pickedColors, readColor, recolored, withAlpha } from "./colors";

const element = (
  id: string,
  type: string,
  extra: { containerId?: string; isDeleted?: boolean } = {},
) => ({
  id,
  type,
  isDeleted: false,
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  ...extra,
});

const state = (selected: string[], tool = "selection") => ({
  selectedElementIds: Object.fromEntries(selected.map((id) => [id, true as const])),
  editingTextElement: null,
  activeTool: { type: tool },
  currentItemStrokeColor: "#1e1e1e",
  currentItemBackgroundColor: "transparent",
});

const drawing = [
  element("box", "rectangle"),
  element("label", "text", { containerId: "box" }),
  element("arrow", "arrow"),
  element("picture", "image"),
  element("gone", "rectangle", { isDeleted: true }),
];

describe("readColor", () => {
  it("reads a grid colour and how much shows through", () => {
    expect(readColor("#fa5252")).toEqual({ base: "#fa5252", alpha: "" });
    expect(readColor("#FA525280")).toEqual({ base: "#fa5252", alpha: "80" });
    expect(readColor("transparent")).toEqual({ base: "transparent", alpha: "" });
  });

  it("finds nothing for a colour the grid does not hold", () => {
    expect(readColor("#123456")).toBeNull();
    expect(readColor("#fa525233")).toBeNull();
  });

  it("writes see-through as the colour's alpha, never on no colour", () => {
    expect(withAlpha("#fa5252", "40")).toBe("#fa525240");
    expect(withAlpha("transparent", "40")).toBe("transparent");
  });
});

describe("recolored", () => {
  it("gives a line colour to what is selected and the text inside a selected box", () => {
    expect(recolored(drawing, state(["box", "arrow"]), "stroke")).toEqual(
      new Set(["box", "arrow", "label"]),
    );
  });

  it("gives a fill only to what can be filled, leaving the text inside", () => {
    expect(recolored(drawing, state(["box", "arrow", "picture"]), "fill")).toEqual(
      new Set(["box"]),
    );
  });

  it("leaves deleted elements and pictures without a line colour", () => {
    expect(recolored(drawing, state(["gone", "picture"]), "stroke")).toEqual(new Set());
  });
});

describe("pickedColors", () => {
  it("shows the selection's colours, with no fill where nothing chosen has one", () => {
    const painted = [
      { ...element("box", "rectangle"), strokeColor: "#1864ab", backgroundColor: "#c3e4ff" },
      element("arrow", "arrow"),
    ];
    expect(pickedColors(painted, state(["box"]))).toEqual({
      stroke: "#1864ab",
      fill: "#c3e4ff",
    });
    expect(pickedColors(painted, state(["arrow"]))).toEqual({
      stroke: "#1e1e1e",
      fill: null,
    });
  });

  it("shows what the next thing drawn takes when nothing is selected", () => {
    expect(pickedColors(drawing, state([], "rectangle"))).toEqual({
      stroke: "#1e1e1e",
      fill: "transparent",
    });
    expect(pickedColors(drawing, state([], "text")).fill).toBeNull();
  });
});
