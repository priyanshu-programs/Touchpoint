import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AiMemoryScope } from "@/db/schema";
import { callName } from "@/lib/greeting";
import { companyHref, contactHref } from "@/lib/record-href";
import { requireOwner } from "@/lib/session";
import { cn } from "@/lib/utils";
import { memoryGraph, memoryNode } from "@/modules/memory/graph";
import {
  companiesOfRemembered,
  countMemories,
  listMemories,
  MEMORY_LIMIT,
} from "@/modules/memory/service";
import { getSettings } from "@/modules/settings/service";
import { GraphPanel } from "./graph-panel";
import { AddMemoryForm, MemoryRow } from "./memory-forms";
import { LIMITS, rowOf } from "./rows";

export const metadata: Metadata = { title: "Memory" };

const params = z.object({
  q: z.string().trim().max(100).catch("").default(""),
  view: z.enum(["graph", "list"]).catch("graph").default("graph"),
  // A person or company to open the graph on, from their Memory tab.
  focus: z
    .string()
    .regex(/^(person|company):[0-9a-f-]{36}$/)
    .optional()
    .catch(undefined),
});

const SECTIONS: { scope: AiMemoryScope; title: string; empty: string }[] = [
  { scope: "you", title: "About you", empty: "Nothing about you yet." },
  { scope: "person", title: "People", empty: "Nothing about people yet." },
  { scope: "company", title: "Companies", empty: "Nothing about companies yet." },
];

const VIEWS = [
  { view: "graph", label: "Graph" },
  { view: "list", label: "List" },
] as const;

export default async function MemorySettingsPage({ searchParams }: PageProps<"/settings/memory">) {
  const owner = await requireOwner();
  const { q, view, focus } = params.parse(await searchParams);
  const graphing = view === "graph";
  const [memories, total, all, atCompany, settings] = await Promise.all([
    listMemories(owner.id, q),
    countMemories(owner.id),
    graphing && q ? listMemories(owner.id) : null,
    graphing ? companiesOfRemembered(owner.id) : [],
    graphing ? getSettings(owner.id) : null,
  ]);
  const everything = all ?? memories;
  const graph = graphing
    ? memoryGraph(callName(owner.name, settings?.preferredName ?? null), everything, atCompany)
    : null;
  const hrefFor = (view: string) => {
    const query = new URLSearchParams({ view, ...(q && { q }) });
    return `/settings/memory?${query}`;
  };

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>What the assistant remembers</CardTitle>
          <CardDescription>
            When you tell the assistant something that stays true, such as how a client likes to
            be reached, it remembers it and uses it in later chats. Everything it remembers is
            here to change or delete. {total} of {MEMORY_LIMIT} kept.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AddMemoryForm full={total >= MEMORY_LIMIT} limits={LIMITS} />
        </CardContent>
      </Card>

      {total > 0 && (
        <nav aria-label="Memory view" className="flex gap-2 text-sm">
          {VIEWS.map((option) => (
            <Link
              key={option.view}
              href={hrefFor(option.view)}
              aria-current={option.view === view ? "page" : undefined}
              className={cn(
                "rounded-md border px-2 py-1 text-muted-foreground",
                option.view === view && "bg-muted font-medium text-foreground",
              )}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      )}

      {total > 0 && (
        <form role="search" className="flex max-w-md gap-2">
          <input type="hidden" name="view" value={view} />
          <Input
            type="search"
            name="q"
            defaultValue={q}
            aria-label="Search memories"
            placeholder="Search memories"
            maxLength={100}
          />
          <Button type="submit" variant="outline">
            Search
          </Button>
          {q && (
            <Link href={`/settings/memory?view=${view}`} className="self-center text-sm underline">
              Clear
            </Link>
          )}
        </form>
      )}

      {q && memories.length === 0 && (
        <p className="text-sm text-muted-foreground">No memories match “{q}”.</p>
      )}

      {graph && total > 0 && (
        <GraphPanel
          nodes={graph.nodes}
          links={graph.links}
          matches={
            q
              ? memories.flatMap((memory) => [
                  memoryNode(memory.id),
                  ...(memory.recordId ? [`${memory.scope}:${memory.recordId}`] : []),
                ])
              : null
          }
          memories={Object.fromEntries(everything.map((memory) => [memoryNode(memory.id), rowOf(memory)]))}
          hrefs={Object.fromEntries(
            graph.nodes.flatMap((node) =>
              node.recordId
                ? [[node.id, node.kind === "person" ? contactHref(node.recordId) : companyHref(node.recordId)]]
                : [],
            ),
          )}
          limits={LIMITS}
          centreOn={focus ?? null}
        />
      )}

      {(!graphing || total === 0) && SECTIONS.map(({ scope, title, empty }) => {
        const rows = memories.filter((memory) => memory.scope === scope);
        if (q && rows.length === 0) return null;
        return (
          <section key={scope} aria-label={title} className="grid gap-2">
            <h2 className="text-lg font-semibold">
              {title} <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
            </h2>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{empty}</p>
            ) : (
              <ul className="grid gap-2">
                {rows.map((memory) => (
                  <li key={memory.id}>
                    <MemoryRow limits={LIMITS} memory={rowOf(memory)} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
