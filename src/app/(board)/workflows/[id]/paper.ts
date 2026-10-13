// The page a drawing sits on: what is drawn behind the whiteboard.
export const PAPERS = [
  { key: "dots", label: "Dotted grid" },
  { key: "grid", label: "Grid" },
  { key: "lines", label: "Lines" },
  { key: "plain", label: "Plain" },
] as const;

export type Paper = (typeof PAPERS)[number]["key"];

export const PAPER_COOKIE = "board-paper";

// The cookie is written in the browser, so only one of the pages above is
// taken from it, and anything else is the dotted grid.
export const paperOf = (cookie: string | undefined): Paper =>
  PAPERS.find(({ key }) => key === cookie)?.key ?? "dots";
