export type Cell = string | number | boolean | null | undefined;

// Excel and Sheets run a cell that starts with one of these as a formula, so a
// value typed into Touchpoint ("=HYPERLINK(…)", "+91 98…") is kept as text.
const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: Cell) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const csvLine = (cells: readonly Cell[]) => `${cells.map(csvCell).join(",")}\r\n`;

// Without it, Excel reads the file as the machine's own code page and garbles ₹ and accents.
export const BOM = "\uFEFF";
