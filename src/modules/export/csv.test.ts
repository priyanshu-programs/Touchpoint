import { describe, expect, it } from "vitest";
import { csvCell, csvLine } from "./csv";

describe("csv", () => {
  it("quotes a cell holding a comma, a quote or a line break, and doubles its quotes", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("Maple, Inc")).toBe('"Maple, Inc"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("keeps text a spreadsheet would run as a formula as text", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+91 98765 43210")).toBe("'+91 98765 43210");
    expect(csvCell("-5")).toBe("'-5");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell('=HYPERLINK("x","y")')).toBe(`"'=HYPERLINK(""x"",""y"")"`);
  });

  it("writes numbers as they are, yes or no for a flag and nothing for an empty value", () => {
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(1500.5)).toBe("1500.5");
    expect(csvCell(true)).toBe("Yes");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("ends a line as a spreadsheet expects", () => {
    expect(csvLine(["a", 1, null])).toBe("a,1,\r\n");
  });
});
