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
import { MEMORY_MAX_LENGTH, MEMORY_TERMS_MAX_LENGTH, type AiMemoryScope } from "@/db/schema";
import { companyHref, contactHref } from "@/lib/record-href";
import { requireOwner } from "@/lib/session";
import { countMemories, listMemories, MEMORY_LIMIT, type ListedMemory } from "@/modules/memory/service";
import { AddMemoryForm, MemoryRow } from "./memory-forms";

export const metadata: Metadata = { title: "Memory" };

const LIMITS = { content: MEMORY_MAX_LENGTH, terms: MEMORY_TERMS_MAX_LENGTH };

const params = z.object({ q: z.string().trim().max(100).catch("").default("") });

const SECTIONS: { scope: AiMemoryScope; title: string; empty: string }[] = [
  { scope: "you", title: "About you", empty: "Nothing about you yet." },
  { scope: "person", title: "People", empty: "Nothing about people yet." },
  { scope: "company", title: "Companies", empty: "Nothing about companies yet." },
];

const hrefOf = (memory: ListedMemory) =>
  memory.recordId
    ? memory.scope === "person"
      ? contactHref(memory.recordId)
      : companyHref(memory.recordId)
    : null;

export default async function MemorySettingsPage({ searchParams }: PageProps<"/settings/memory">) {
  const owner = await requireOwner();
  const { q } = params.parse(await searchParams);
  const [memories, total] = await Promise.all([listMemories(owner.id, q), countMemories(owner.id)]);

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
        <form role="search" className="flex max-w-md gap-2">
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
            <Link href="/settings/memory" className="self-center text-sm underline">
              Clear
            </Link>
          )}
        </form>
      )}

      {q && memories.length === 0 && (
        <p className="text-sm text-muted-foreground">No memories match “{q}”.</p>
      )}

      {SECTIONS.map(({ scope, title, empty }) => {
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
                    <MemoryRow
                      limits={LIMITS}
                      memory={{
                        id: memory.id,
                        content: memory.content,
                        terms: memory.terms,
                        recordName: memory.recordName,
                        recordHref: hrefOf(memory),
                        fromAssistant: memory.source === "ai",
                      }}
                    />
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
