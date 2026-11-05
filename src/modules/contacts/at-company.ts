import { and, asc, eq, inArray, notExists } from "drizzle-orm";
import type { Executor } from "@/db/client";
import { contactOrganizations, contacts, organizations } from "@/db/schema";

export type Outsiders = { company: string; people: { id: string; name: string }[] };

// Who of these people is not one of the company's contacts. A send, an activity or a
// meeting about a company is only with its own people.
export async function outsiders(
  executor: Executor,
  ownerId: string,
  organizationId: string,
  contactIds: string[],
): Promise<Outsiders | null> {
  if (contactIds.length === 0) return null;
  const people = await executor
    .select({ id: contacts.id, name: contacts.fullName })
    .from(contacts)
    .where(
      and(
        eq(contacts.ownerId, ownerId),
        inArray(contacts.id, contactIds),
        notExists(
          executor
            .select({ id: contactOrganizations.contactId })
            .from(contactOrganizations)
            .where(
              and(
                eq(contactOrganizations.contactId, contacts.id),
                eq(contactOrganizations.organizationId, organizationId),
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(contacts.fullName));
  if (people.length === 0) return null;
  const [company] = await executor
    .select({ name: organizations.name })
    .from(organizations)
    .where(and(eq(organizations.ownerId, ownerId), eq(organizations.id, organizationId)));
  return { company: company?.name ?? "the company", people };
}

const listed = new Intl.ListFormat("en-GB", { type: "conjunction" });

export const outsidersMessage = ({ company, people }: Outsiders) =>
  `${listed.format(people.map(({ name }) => name))} ${people.length === 1 ? "isn't" : "aren't"} at ${company}. Add them to the company first, or take them off.`;
