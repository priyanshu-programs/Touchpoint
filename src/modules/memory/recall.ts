import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { aiMemories, contacts, organizations, type AiMemoryScope } from "@/db/schema";
import { plain, wordsOf } from "./words";

// Found before every reply with no model call: the owner's own memories, those on the
// people and companies the message names, then those sharing its words.
const ABOUT_YOU = 30;
const ON_RECORDS = 20;
const BY_WORDS = 10;

export type Recalled = {
  id: string;
  scope: AiMemoryScope;
  name: string | null;
  content: string;
};

const plainSql = (column: unknown) =>
  sql`' ' || btrim(lower(regexp_replace(${column}, '[^[:alnum:]]+', ' ', 'g'))) || ' '`;

const name = sql<string | null>`coalesce(${contacts.fullName}, ${organizations.name})`;
const columns = {
  id: aiMemories.id,
  scope: aiMemories.scope,
  name,
  content: aiMemories.content,
};

export async function recallMemories(ownerId: string, text: string): Promise<Recalled[]> {
  const padded = plain(text);
  const words = wordsOf(text);

  const from = () =>
    db
      .select(columns)
      .from(aiMemories)
      .leftJoin(contacts, eq(contacts.id, aiMemories.contactId))
      .leftJoin(organizations, eq(organizations.id, aiMemories.organizationId));

  const you = from()
    .where(and(eq(aiMemories.ownerId, ownerId), eq(aiMemories.scope, "you")))
    .orderBy(desc(aiMemories.createdAt))
    .limit(ABOUT_YOU);

  // A person is named by their full name, or by a first name of three letters or more.
  const named = from()
    .where(
      and(
        eq(aiMemories.ownerId, ownerId),
        sql`(
          position(${plainSql(contacts.fullName)} in ${padded}) > 0
          or (char_length(${contacts.firstName}) >= 3 and position(${plainSql(contacts.firstName)} in ${padded}) > 0)
          or position(${plainSql(organizations.name)} in ${padded}) > 0
        )`,
      ),
    )
    .orderBy(desc(aiMemories.createdAt))
    .limit(ON_RECORDS);

  let matched: PromiseLike<Recalled[]> = Promise.resolve([]);
  if (words.length > 0) {
    const query = words.join(" or ");
    const english = sql`websearch_to_tsquery('english', ${query})`;
    const simple = sql`websearch_to_tsquery('simple', ${query})`;
    // A near spelling ("Whatsap") still finds a memory, by trigrams.
    const long = words.filter((word) => word.length >= 4);
    const near = long.length
      ? sql`or exists (
          select 1 from unnest(string_to_array(${long.join(" ")}, ' ')) as word
          where word_similarity(word, ${aiMemories.content}) >= 0.6
        )`
      : sql``;
    matched = from()
      .where(
        and(
          eq(aiMemories.ownerId, ownerId),
          sql`${aiMemories.scope} <> 'you'`,
          sql`(${aiMemories.search} @@ ${english} or ${aiMemories.search} @@ ${simple} ${near})`,
        ),
      )
      .orderBy(
        sql`greatest(ts_rank(${aiMemories.search}, ${english}), ts_rank(${aiMemories.search}, ${simple})) desc`,
        desc(aiMemories.createdAt),
      )
      // Room for those also found by name, which are left out below.
      .limit(BY_WORDS + ON_RECORDS);
  }

  // Three reads at once: each is a round trip before the model is asked.
  const [own, onRecords, byWords] = await Promise.all([you, named, matched]);
  const found = new Set(onRecords.map(({ id }) => id));
  return [...own, ...onRecords, ...byWords.filter(({ id }) => !found.has(id)).slice(0, BY_WORDS)];
}

// The person or company a memory is about, by the name the owner used. One clear match
// is taken; several are listed back so the model can ask which.
export async function recordByName(
  ownerId: string,
  scope: "person" | "company",
  typed: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; message: string }> {
  const table = scope === "person" ? contacts : organizations;
  const column = scope === "person" ? contacts.fullName : organizations.name;
  const rows = await db
    .select({
      id: table.id,
      name: column,
      exact: sql<boolean>`lower(${column}) = lower(${typed})`,
    })
    .from(table)
    .where(
      and(
        eq(table.ownerId, ownerId),
        isNull(table.archivedAt),
        sql`word_similarity(${typed}, ${column}) >= 0.7`,
      ),
    )
    .orderBy(sql`word_similarity(${typed}, ${column}) desc`, sql`similarity(${typed}, ${column}) desc`)
    .limit(4);
  const exact = rows.filter((row) => row.exact);
  if (exact.length === 1) return { ok: true, id: exact[0].id, name: exact[0].name };
  if (rows.length === 1) return { ok: true, id: rows[0].id, name: rows[0].name };
  const what = scope === "person" ? "person" : "company";
  if (rows.length === 0) {
    return { ok: false, message: `No ${what} called "${typed}" is in Touchpoint.` };
  }
  return {
    ok: false,
    message: `Several match "${typed}": ${rows.map((row) => row.name).join(", ")}. Use the full name.`,
  };
}
