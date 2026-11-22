"use client";

import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { Expand, Maximize2, Minus, Plus, Shrink } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { GraphLink, GraphNode } from "@/modules/memory/graph";

type Node = GraphNode & SimulationNodeDatum;
type Link = SimulationLinkDatum<Node> & { kind: GraphLink["kind"]; word?: string };
type View = { x: number; y: number; k: number };

// A void with Touchpoint's lime, the way the orb glows, and violet for companies.
const COLORS = {
  void: "#0b0d10",
  you: "#b3ff00",
  person: "#b3ff00",
  company: "#a78bfa",
  memory: "#e6ffb3",
  about: "rgba(45, 212, 191, 0.28)",
  word: "rgba(167, 139, 250, 0.5)",
  label: "rgba(255, 255, 255, 0.82)",
};
const RADIUS: Record<GraphNode["kind"], number> = { you: 11, company: 7, person: 6, memory: 4 };
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 6;
// Dots grow slower than the zoom, so zooming in spreads them apart rather than fattening them.
const radiusOf = (node: GraphNode) => (node.centre ? RADIUS.you : RADIUS[node.kind]);
const radiusAt = (node: GraphNode, k: number) => radiusOf(node) / Math.sqrt(k);
// A small graph isn't blown up to fill the screen.
const MAX_FIT_ZOOM = 2.5;
const MEMORY_LABEL_ZOOM = 1.4;
const MEMORY_LABEL_CHARS = 36;
// How close "See in graph" opens on the record it was asked from.
const CENTRE_ZOOM = 1.6;

const neighboursOf = (links: Link[], id: string) => {
  const near = new Set([id]);
  for (const link of links) {
    const source = (link.source as Node).id;
    const target = (link.target as Node).id;
    if (source === id) near.add(target);
    if (target === id) near.add(source);
  }
  return near;
};

export function MemoryGraph({
  nodes: given,
  links: givenLinks,
  matches,
  selected,
  onSelect,
  full = false,
  onFull,
  centreOn = null,
}: {
  nodes: GraphNode[];
  links: GraphLink[];
  // Ids of nodes a search found; null when nothing is searched.
  matches: Set<string> | null;
  selected: string | null;
  onSelect: (node: GraphNode | null) => void;
  // Filling the window; the box then takes its size from what holds it.
  full?: boolean;
  onFull?: () => void;
  // The node to open on instead of fitting the whole graph.
  centreOn?: string | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0, ratio: 1 });
  const [hover, setHover] = useState<{ node: Node; x: number; y: number } | null>(null);
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const simulation = useRef<Simulation<Node, Link> | null>(null);
  // Kept across new data (an edit, a delete), so the graph doesn't jump.
  const placed = useRef(new Map<string, { x: number; y: number }>());
  const frame = useRef(0);

  // The layout's own copies, moved by it on every tick; read only when drawing or pointing.
  const graph = useRef<{ nodes: Node[]; links: Link[] }>({ nodes: [], links: [] });

  const draw = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const element = canvas.current;
      const context = element?.getContext("2d");
      if (!element || !context || size.width === 0) return;
      const { nodes, links } = graph.current;
      const { ratio } = size;
      const { x, y, k } = view.current;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.fillStyle = COLORS.void;
      context.fillRect(0, 0, size.width, size.height);
      context.translate(size.width / 2 + x, size.height / 2 + y);
      context.scale(k, k);

      const focus = hover ? neighboursOf(links, hover.node.id) : null;
      const lit = (id: string) => (focus ? focus.has(id) : matches ? matches.has(id) : true);

      for (const link of links) {
        const source = link.source as Node;
        const target = link.target as Node;
        const on = lit(source.id) && lit(target.id);
        context.globalAlpha = on ? 1 : 0.15;
        context.strokeStyle = link.kind === "word" ? COLORS.word : COLORS.about;
        context.lineWidth = (link.kind === "word" ? 0.8 : 0.9) / Math.sqrt(k);
        context.beginPath();
        context.moveTo(source.x!, source.y!);
        context.lineTo(target.x!, target.y!);
        context.stroke();
      }

      for (const node of nodes) {
        const on = lit(node.id);
        const radius = radiusAt(node, k);
        context.globalAlpha = on ? 1 : 0.2;
        context.shadowColor = COLORS[node.kind];
        context.beginPath();
        context.arc(node.x!, node.y!, radius, 0, Math.PI * 2);
        if (node.hollow) {
          context.shadowBlur = 0;
          context.strokeStyle = COLORS[node.kind];
          context.lineWidth = 1.2 / Math.sqrt(k);
          context.stroke();
        } else {
          context.shadowBlur = on && node.kind !== "memory" ? 12 : 0;
          context.fillStyle = COLORS[node.kind];
          context.fill();
        }
        if (node.id === selected) {
          context.shadowBlur = 0;
          context.strokeStyle = "#ffffff";
          context.lineWidth = 1.5 / k;
          context.beginPath();
          context.arc(node.x!, node.y!, radius + 3, 0, Math.PI * 2);
          context.stroke();
        }
      }
      context.shadowBlur = 0;

      // Names of you, people and companies once there is room to read them.
      if (k >= 0.6) {
        context.font = `${12 / k}px system-ui, sans-serif`;
        context.textAlign = "center";
        for (const node of nodes) {
          if (node.kind === "memory") continue;
          context.globalAlpha = lit(node.id) ? 1 : 0.25;
          context.fillStyle = COLORS.label;
          context.fillText(node.label, node.x!, node.y! + radiusAt(node, k) + 14 / k);
        }
      }
      // Each memory's words beside its dot, once zoomed in close enough to read them.
      if (k >= MEMORY_LABEL_ZOOM) {
        context.font = `${10 / k}px system-ui, sans-serif`;
        context.textAlign = "left";
        for (const node of nodes) {
          if (node.kind !== "memory") continue;
          context.globalAlpha = lit(node.id) ? 0.7 : 0.15;
          context.fillStyle = COLORS.label;
          const text =
            node.label.length > MEMORY_LABEL_CHARS ? `${node.label.slice(0, MEMORY_LABEL_CHARS - 1)}…` : node.label;
          context.fillText(text, node.x! + radiusAt(node, k) + 4 / k, node.y! + 3 / k);
        }
      }
      context.globalAlpha = 1;
    });
  }, [hover, matches, selected, size]);

  // The layout's ticks draw with the latest view, hover and size.
  const drawLatest = useRef(draw);
  const fitLatest = useRef<() => boolean>(() => false);
  const fitted = useRef(false);
  // Panned or zoomed by hand: the view is the owner's from then on.
  const moved = useRef(false);
  useEffect(() => {
    drawLatest.current = draw;
  }, [draw]);

  useEffect(() => {
    const element = wrap.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      setSize({
        width,
        height: full
          ? Math.round(entry.contentRect.height)
          : Math.round(Math.min(Math.max(window.innerHeight * 0.6, 360), 640)),
        ratio: window.devicePixelRatio || 1,
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [full]);

  useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // A company graph's company stays in the middle; dragging it lets it go.
    const nodes: Node[] = given.map((node) => ({
      ...node,
      ...placed.current.get(node.id),
      ...(node.centre && !placed.current.has(node.id) && { fx: 0, fy: 0 }),
    }));
    const links: Link[] = givenLinks.map((link) => ({ ...link }));
    graph.current = { nodes, links };
    const sim = forceSimulation<Node, Link>(nodes)
      .force(
        "link",
        forceLink<Node, Link>(links)
          .id((node) => node.id)
          .distance((link) => (link.kind === "word" ? 70 : link.kind === "works" ? 60 : 45))
          .strength((link) => (link.kind === "word" ? 0.05 : 0.6)),
      )
      .force("charge", forceManyBody<Node>().strength((node) => (node.kind === "memory" ? -18 : -120)))
      .force("collide", forceCollide<Node>((node) => radiusOf(node) + 2))
      .force("x", forceX<Node>(0).strength(0.03))
      .force("y", forceY<Node>(0).strength(0.03))
      .on("tick", () => {
        for (const node of nodes) placed.current.set(node.id, { x: node.x!, y: node.y! });
        // Once the layout has mostly settled, it is fitted to the box, unless moved by hand.
        if (!fitted.current && sim.alpha() < 0.3 && !moved.current) fitted.current = fitLatest.current();
        drawLatest.current();
      });
    if (still) {
      sim.stop();
      sim.tick(300);
      for (const node of nodes) placed.current.set(node.id, { x: node.x!, y: node.y! });
      if (!fitted.current && !moved.current) fitted.current = fitLatest.current();
      drawLatest.current();
    }
    simulation.current = sim;
    return () => {
      sim.stop();
    };
  }, [given, givenLinks]);

  useEffect(draw, [draw]);

  const toWorld = (clientX: number, clientY: number) => {
    const rect = canvas.current!.getBoundingClientRect();
    const { x, y, k } = view.current;
    return {
      x: (clientX - rect.left - size.width / 2 - x) / k,
      y: (clientY - rect.top - size.height / 2 - y) / k,
    };
  };

  const nodeAt = (clientX: number, clientY: number) => {
    const point = toWorld(clientX, clientY);
    const reach = 6 / view.current.k;
    let best: Node | null = null;
    let bestDistance = Infinity;
    for (const node of graph.current.nodes) {
      const distance = Math.hypot(node.x! - point.x, node.y! - point.y);
      if (distance <= radiusAt(node, view.current.k) + reach && distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  };

  const zoomBy = useCallback(
    (factor: number, around?: { x: number; y: number }) => {
      const current = view.current;
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.k * factor));
      const at = around ?? { x: 0, y: 0 };
      // The point under the cursor stays where it is.
      view.current = {
        k,
        x: at.x - ((at.x - current.x) * k) / current.k,
        y: at.y - ((at.y - current.y) * k) / current.k,
      };
      draw();
    },
    [draw],
  );

  // Whether it could fit: not before the box has a size.
  const fit = useCallback(() => {
    const { nodes } = graph.current;
    if (nodes.length === 0 || size.width === 0) return false;
    const xs = nodes.map((node) => node.x ?? 0);
    const ys = nodes.map((node) => node.y ?? 0);
    const width = Math.max(...xs) - Math.min(...xs) + 120;
    const height = Math.max(...ys) - Math.min(...ys) + 120;
    const k = Math.min(MAX_FIT_ZOOM, Math.max(MIN_ZOOM, Math.min(size.width / width, size.height / height)));
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
    view.current = { k, x: -cx * k, y: -cy * k };
    draw();
    return true;
  }, [draw, size]);
  // The first view: on the record asked for when there is one, else the whole graph.
  const firstView = useCallback(() => {
    const node = centreOn ? graph.current.nodes.find(({ id }) => id === centreOn) : null;
    if (!node || size.width === 0) return fit();
    view.current = { k: CENTRE_ZOOM, x: -node.x! * CENTRE_ZOOM, y: -node.y! * CENTRE_ZOOM };
    draw();
    return true;
  }, [centreOn, draw, fit, size]);
  useEffect(() => {
    fitLatest.current = firstView;
  }, [firstView]);

  // Going in or out of full screen fits again, unless the view was moved by hand.
  const sizeSeen = useRef(size);
  useEffect(() => {
    const before = sizeSeen.current;
    sizeSeen.current = size;
    if (before.width === 0 || !fitted.current || moved.current) return;
    if (before.width !== size.width || before.height !== size.height) fitLatest.current();
  }, [size]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      moved.current = true;
      const rect = element.getBoundingClientRect();
      zoomBy(Math.exp(-event.deltaY * 0.0015), {
        x: event.clientX - rect.left - size.width / 2,
        y: event.clientY - rect.top - size.height / 2,
      });
    };
    // Not passive, so the page doesn't scroll while zooming.
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [size, zoomBy]);

  const press = useRef<{
    node: Node | null;
    startX: number;
    startY: number;
    view: View;
    moved: boolean;
  } | null>(null);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const node = nodeAt(event.clientX, event.clientY);
    press.current = { node, startX: event.clientX, startY: event.clientY, view: view.current, moved: false };
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
      simulation.current?.alphaTarget(0.2).restart();
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const held = press.current;
    if (!held) {
      const node = nodeAt(event.clientX, event.clientY);
      const rect = event.currentTarget.getBoundingClientRect();
      setHover(node ? { node, x: event.clientX - rect.left, y: event.clientY - rect.top } : null);
      return;
    }
    const dx = event.clientX - held.startX;
    const dy = event.clientY - held.startY;
    if (Math.hypot(dx, dy) > 3) held.moved = true;
    if (held.node) {
      const point = toWorld(event.clientX, event.clientY);
      held.node.fx = point.x;
      held.node.fy = point.y;
    } else {
      moved.current = true;
      view.current = { ...held.view, x: held.view.x + dx, y: held.view.y + dy };
      draw();
    }
  };

  const onPointerUp = () => {
    const held = press.current;
    press.current = null;
    if (!held) return;
    if (held.node) {
      held.node.fx = null;
      held.node.fy = null;
      simulation.current?.alphaTarget(0);
    }
    if (!held.moved) onSelect(held.node);
  };

  const memories = given.filter((node) => node.kind === "memory").length;
  const subjects = given.filter((node) => node.kind === "person" || node.kind === "company").length;

  return (
    <div
      ref={wrap}
      className={full ? "absolute inset-0 overflow-hidden" : "relative overflow-hidden rounded-md border"}
    >
      <canvas
        ref={canvas}
        width={size.width * size.ratio}
        height={size.height * size.ratio}
        style={{ width: size.width, height: size.height, background: COLORS.void }}
        className="block touch-none cursor-grab active:cursor-grabbing"
        role="img"
        aria-label={`Memory graph: ${memories} ${memories === 1 ? "memory" : "memories"}, ${subjects} ${subjects === 1 ? "person or company" : "people and companies"}. The list view shows them as text.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
      />
      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 max-w-64 rounded-md bg-black/85 px-2 py-1 text-xs text-white"
          style={{ left: Math.min(hover.x + 12, size.width - 200), top: hover.y + 12 }}
        >
          {hover.node.label}
        </div>
      )}
      <div className="absolute top-2 right-2 flex gap-1">
        <Button type="button" size="icon-sm" variant="secondary" aria-label="Zoom in" onClick={() => { moved.current = true; zoomBy(1.3); }}>
          <Plus aria-hidden />
        </Button>
        <Button type="button" size="icon-sm" variant="secondary" aria-label="Zoom out" onClick={() => { moved.current = true; zoomBy(1 / 1.3); }}>
          <Minus aria-hidden />
        </Button>
        <Button type="button" size="icon-sm" variant="secondary" aria-label="Fit to view" onClick={fit}>
          <Maximize2 aria-hidden />
        </Button>
        {onFull && (
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            aria-label={full ? "Leave full screen" : "Full screen"}
            title={full ? "Leave full screen (Esc)" : "Full screen"}
            onClick={onFull}
          >
            {full ? <Shrink aria-hidden /> : <Expand aria-hidden />}
          </Button>
        )}
      </div>
    </div>
  );
}
