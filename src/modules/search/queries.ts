import {
  type AnyColumn,
  and,
  asc,
  desc,
  eq,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db/client";
import {
  activities,
  contacts,
  materials,
  organizations,
  tasks,
  workflowBoards,
} from "@/db/schema";
import { likePrefix, prefixTsQuery } from "@/lib/text-search";
import { companies } from "@/modules/contacts/queries";

export const PER_KIND = 5;
// Shorter text matches nearly every name by its letters alone.
const FUZZY_FROM = 4;
const FUZZY_SCORE = 0.3;

const contains = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

// How close the typed text comes to any run of words in the name, so "Pryia" still finds Priya Sharma.
const closeness = (name: AnyColumn, q: string) =>
  sql<number>`word_similarity(${q}, ${name}::text)`;

export async function searchEverything(ownerId: string, input: string) {
  const q = input.trim();
  const tsQuery = prefixTsQuery(q);
  if (q.length < 2 || !tsQuery) return null;
  const fuzzy = q.length >= FUZZY_FROM;
  const matches = (search: AnyColumn) =>
    sql<boolean>`${search} @@ to_tsquery('simple', ${tsQuery})`;
  const close = (name: AnyColumn) =>
    fuzzy ? sql`${closeness(name, q)} >= ${FUZZY_SCORE}` : undefined;

  const [companyRows, personRows, materialRows, workflowRows, activityRows, taskRows] =
    await Promise.all([
      db
        .select({
          id: organizations.id,
          name: organizations.name,
          domain: organizations.domain,
        })
        .from(organizations)
        .where(
          and(
            eq(organizations.ownerId, ownerId),
            isNull(organizations.archivedAt),
            or(
              matches(organizations.search),
              sql`${organizations.domain} like ${likePrefix(q.toLowerCase())}`,
              sql`exists (
                select 1 from organization_tags ot join tags t on t.id = ot.tag_id
                where ot.organization_id = "organizations"."id" and t.name like ${likePrefix(q)}
              )`,
              close(organizations.name),
            ),
          ),
        )
        .orderBy(
          desc(matches(organizations.search)),
          desc(closeness(organizations.name, q)),
          asc(sql`lower(${organizations.name})`),
        )
        .limit(PER_KIND),
      db
        .select({ id: contacts.id, name: contacts.fullName, companies })
        .from(contacts)
        .where(
          and(
            eq(contacts.ownerId, ownerId),
            isNull(contacts.archivedAt),
            or(
              matches(contacts.search),
              sql`exists (
                select 1 from contact_emails e
                where e.contact_id = "contacts"."id" and e.email like ${likePrefix(q)}
              )`,
              sql`exists (
                select 1 from contact_tags ct join tags t on t.id = ct.tag_id
                where ct.contact_id = "contacts"."id" and t.name like ${likePrefix(q)}
              )`,
              close(contacts.fullName),
            ),
          ),
        )
        .orderBy(
          desc(matches(contacts.search)),
          desc(closeness(contacts.fullName, q)),
          asc(sql`lower(${contacts.fullName})`),
        )
        .limit(PER_KIND),
      db
        .select({ id: materials.id, name: materials.name, type: materials.type })
        .from(materials)
        .where(
          and(
            eq(materials.ownerId, ownerId),
            or(sql`${materials.name} ilike ${contains(q)}`, close(materials.name)),
          ),
        )
        .orderBy(desc(closeness(materials.name, q)), asc(sql`lower(${materials.name})`))
        .limit(PER_KIND),
      db
        .select({
          id: workflowBoards.id,
          name: workflowBoards.name,
          company: organizations.name,
          person: contacts.fullName,
        })
        .from(workflowBoards)
        .leftJoin(organizations, eq(organizations.id, workflowBoards.organizationId))
        .leftJoin(contacts, eq(contacts.id, workflowBoards.contactId))
        .where(
          and(
            eq(workflowBoards.ownerId, ownerId),
            or(
              sql`${workflowBoards.name} ilike ${contains(q)}`,
              close(workflowBoards.name),
            ),
          ),
        )
        // The owner's workflows come before the copies on their records.
        .orderBy(
          sql`num_nonnulls(${workflowBoards.organizationId}, ${workflowBoards.contactId})`,
          desc(closeness(workflowBoards.name, q)),
          asc(sql`lower(${workflowBoards.name})`),
        )
        .limit(PER_KIND),
      db
        .select({
          id: activities.id,
          title: activities.title,
          kind: activities.kind,
          occurredAt: activities.occurredAt,
        })
        .from(activities)
        .where(and(eq(activities.ownerId, ownerId), matches(activities.search)))
        .orderBy(desc(activities.occurredAt), asc(activities.id))
        .limit(PER_KIND),
      db
        .select({
          id: tasks.id,
          title: tasks.title,
          status: tasks.status,
          dueOn: tasks.dueOn,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.ownerId, ownerId),
            ne(tasks.status, "cancelled"),
            matches(tasks.search),
          ),
        )
        .orderBy(
          sql`${tasks.status} = 'done'`,
          sql`${tasks.dueOn} asc nulls last`,
          asc(tasks.id),
        )
        .limit(PER_KIND),
    ]);

  return {
    companies: companyRows,
    people: personRows,
    materials: materialRows,
    workflows: workflowRows,
    activities: activityRows,
    tasks: taskRows,
  };
}

export type SearchResults = NonNullable<Awaited<ReturnType<typeof searchEverything>>>;
