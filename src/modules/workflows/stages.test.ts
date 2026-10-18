import { describe, expect, it } from "vitest";
import type { BoardStage, StageStatus } from "@/db/schema";
import {
  downstreamOf,
  placeOf,
  stageLinks,
  statusesAfterMove,
  upstreamOf,
} from "./stages";

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

describe("statusesAfterMove", () => {
  const moved = (
    statuses: Record<string, StageStatus>,
    target: Parameters<typeof statusesAfterMove>[2],
  ) => Object.fromEntries(statusesAfterMove(stagesAt(statuses), branching, target));

  it("marks the way to a stage done and begins it on a straight line", () => {
    const order = ["a", "b", "c"];
    const line = stageLinks([arrow("a", "b"), arrow("b", "c")], new Set(order));
    const stages = order.map((elementId) => ({
      elementId,
      name: elementId,
      status: "not_started" as const,
    }));
    expect(
      Object.fromEntries(statusesAfterMove(stages, line, { elementId: "b" })),
    ).toEqual({ a: "done", b: "in_progress" });
  });

  it("gives back only what changes", () => {
    expect(moved({ brief: "done", design: "in_progress" }, { elementId: "design" })).toEqual(
      {},
    );
  });

  it("moves along one branch, leaving the other", () => {
    expect(moved({ copy: "in_progress" }, { elementId: "design" })).toEqual({
      brief: "done",
      design: "in_progress",
    });
  });

  it("begins again what comes after, keeping a stage held up", () => {
    expect(
      moved(
        { brief: "done", design: "done", copy: "done", review: "done", launch: "blocked" },
        { elementId: "design" },
      ),
    ).toEqual({ design: "in_progress", review: "not_started" });
  });

  it("sets every stage done, or every stage not started", () => {
    expect(moved({ brief: "done", design: "blocked" }, "done")).toEqual({
      design: "done",
      copy: "done",
      review: "done",
      launch: "done",
    });
    expect(moved({ brief: "done", design: "blocked" }, "not_started")).toEqual({
      brief: "not_started",
      design: "not_started",
    });
  });

  it("does not follow an arrow drawn back to an earlier stage", () => {
    const order = ["plan", "do", "review"];
    const loop = stageLinks(
      [arrow("plan", "do"), arrow("do", "review"), arrow("review", "plan")],
      new Set(order),
    );
    const stages = order.map((elementId) => ({
      elementId,
      name: elementId,
      status: "done" as const,
    }));
    expect(
      Object.fromEntries(statusesAfterMove(stages, loop, { elementId: "do" })),
    ).toEqual({ do: "in_progress", review: "not_started" });
  });

  it("changes nothing for a stage the drawing does not have", () => {
    expect(moved({}, { elementId: "nowhere" })).toEqual({});
  });

  describe("from a stage", () => {
    const from = (
      statuses: Record<string, StageStatus>,
      target: Parameters<typeof statusesAfterMove>[2],
      left: string[],
    ) =>
      Object.fromEntries(statusesAfterMove(stagesAt(statuses), branching, target, left));

    it("leaves the other branch it was taken from behind, done when it comes first", () => {
      expect(from({ brief: "done", design: "in_progress" }, { elementId: "copy" }, ["design"]))
        .toEqual({ design: "done", copy: "in_progress" });
      expect(from({ brief: "done", copy: "in_progress" }, { elementId: "design" }, ["copy"]))
        .toEqual({ design: "in_progress", copy: "not_started" });
    });

    it("leaves a stage behind that no arrow joins to the one moved to", () => {
      // a leads to b; c and d are drawn with arrows that end loose.
      const order = ["a", "b", "c", "d"];
      const loose = stageLinks([arrow("a", "b")], new Set(order));
      const stages = (statuses: Record<string, StageStatus>) =>
        order.map((elementId) => ({
          elementId,
          name: elementId,
          status: statuses[elementId] ?? ("not_started" as const),
        }));
      expect(
        Object.fromEntries(
          statusesAfterMove(stages({ a: "done", b: "in_progress" }), loose, { elementId: "c" }, [
            "b",
          ]),
        ),
      ).toEqual({ b: "done", c: "in_progress" });
      expect(
        Object.fromEntries(
          statusesAfterMove(stages({ a: "done", d: "blocked" }), loose, { elementId: "c" }, [
            "d",
          ]),
        ),
      ).toEqual({ c: "in_progress", d: "not_started" });
    });

    it("is the same move when taken from the stage it is put back on, or from the way there", () => {
      expect(from({ design: "blocked" }, { elementId: "design" }, ["design"])).toEqual({
        brief: "done",
        design: "in_progress",
      });
      expect(from({ brief: "in_progress" }, { elementId: "design" }, ["brief"])).toEqual({
        brief: "done",
        design: "in_progress",
      });
    });
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
