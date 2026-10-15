import { describe, expect, it } from "vitest";
import type { BoardStage, StageStatus } from "@/db/schema";
import { downstreamOf, placeOf, stageLinks, upstreamOf } from "./stages";

const arrow = (from: string, to: string) => ({
  id: `${from}-${to}`,
  type: "arrow",
  startBinding: { elementId: from, focus: 0, gap: 1 },
  endBinding: { elementId: to, focus: 0, gap: 1 },
});
const sorted = (ids: Set<string>) => [...ids].sort();

// Brief, then Design and Copy side by side, both leading to Review, then Launch.
const BRANCHING = ["brief", "design", "copy", "review", "launch"];
const branching = stageLinks(
  [
    arrow("brief", "design"),
    arrow("brief", "copy"),
    arrow("design", "review"),
    arrow("copy", "review"),
    arrow("review", "launch"),
  ],
  new Set(BRANCHING),
);
const stagesAt = (statuses: Record<string, StageStatus>): BoardStage[] =>
  BRANCHING.map((elementId) => ({
    elementId,
    name: elementId,
    status: statuses[elementId] ?? "not_started",
  }));

describe("stageLinks", () => {
  it("keeps each arrow between two stages once", () => {
    const links = stageLinks(
      [
        arrow("a", "b"),
        arrow("a", "b"),
        arrow("a", "note"),
        arrow("b", "b"),
        { id: "loose", type: "arrow", startBinding: null, endBinding: null },
        { id: "box", type: "rectangle" },
      ],
      new Set(["a", "b"]),
    );
    expect(links).toEqual(new Map([["a", new Set(["b"])]]));
  });
});

describe("upstreamOf and downstreamOf", () => {
  it("follow the arrows on a straight line", () => {
    const order = ["a", "b", "c"];
    const links = stageLinks([arrow("a", "b"), arrow("b", "c")], new Set(order));
    expect(sorted(upstreamOf(links, order, "c"))).toEqual(["a", "b"]);
    expect(sorted(downstreamOf(links, order, "a"))).toEqual(["b", "c"]);
    expect(sorted(upstreamOf(links, order, "a"))).toEqual([]);
  });

  it("leave the other branch out", () => {
    expect(sorted(upstreamOf(branching, BRANCHING, "design"))).toEqual(["brief"]);
    expect(sorted(downstreamOf(branching, BRANCHING, "design"))).toEqual([
      "launch",
      "review",
    ]);
    expect(sorted(upstreamOf(branching, BRANCHING, "review"))).toEqual([
      "brief",
      "copy",
      "design",
    ]);
  });

  it("go by the stage order where no arrow joins two stages", () => {
    const order = ["a", "b", "c"];
    const none = stageLinks([], new Set(order));
    expect(sorted(upstreamOf(none, order, "b"))).toEqual(["a"]);
    expect(sorted(downstreamOf(none, order, "b"))).toEqual(["c"]);
  });

  it("do not follow an arrow drawn back to an earlier stage", () => {
    const order = ["plan", "do", "review"];
    const links = stageLinks(
      [arrow("plan", "do"), arrow("do", "review"), arrow("review", "plan")],
      new Set(order),
    );
    expect(sorted(upstreamOf(links, order, "do"))).toEqual(["plan"]);
    expect(sorted(downstreamOf(links, order, "do"))).toEqual(["review"]);
  });
});

describe("placeOf", () => {
  it("puts a copy with nothing begun, or no stages, in Not started", () => {
    expect(placeOf(stagesAt({}), branching)).toBe("not_started");
    expect(placeOf([], new Map())).toBe("not_started");
  });

  it("puts a copy with every stage done in Done", () => {
    const all = Object.fromEntries(BRANCHING.map((id) => [id, "done" as const]));
    expect(placeOf(stagesAt(all), branching)).toBe("done");
  });

  it("puts a copy at every stage in progress or held up", () => {
    expect(
      placeOf(
        stagesAt({ brief: "done", design: "in_progress", copy: "blocked" }),
        branching,
      ),
    ).toEqual({ stages: ["design", "copy"] });
  });

  it("puts a copy with nothing under way at each stage it can begin", () => {
    expect(placeOf(stagesAt({ brief: "done" }), branching)).toEqual({
      stages: ["design", "copy"],
    });
    // Review waits for both branches.
    expect(placeOf(stagesAt({ brief: "done", design: "done" }), branching)).toEqual({
      stages: ["copy"],
    });
  });
});
