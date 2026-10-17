import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, organizations, workflowBoards } from "@/db/schema";
import { photoVersion } from "@/modules/contacts/queries";
import { logoVersion } from "@/modules/organizations/queries";
import { MAX_RECORD_BOARDS, MAX_TEMPLATES, type BoardSubject } from "./schema";

// The owner's workflows in the order they put them in, by name where they have
// not. A company's or a person's own copy is not among them.
export async function listTemplates(ownerId: string) {
  return db
    .select({
      id: workflowBoards.id,
      name: workflowBoards.name,
      description: workflowBoards.description,
      icon: workflowBoards.icon,
      starterKey: workflowBoards.starterKey,
    })
    .from(workflowBoards)
    .where(
      and(
        eq(workflowBoards.ownerId, ownerId),
        isNull(workflowBoards.organizationId),
        isNull(workflowBoards.contactId),
      ),
    )
    .orderBy(asc(workflowBoards.position), asc(workflowBoards.name))
    .limit(MAX_TEMPLATES);
}

// The boards started on one company or one person: the starred one, then the
// newest first.
export async function listRecordBoards(ownerId: string, subject: BoardSubject) {
  return db
    .select({
      id: workflowBoards.id,
      name: workflowBoards.name,
      description: workflowBoards.description,
      icon: workflowBoards.icon,
      starred: workflowBoards.starred,
    })
    .from(workflowBoards)
    .where(
      and(
        eq(workflowBoards.ownerId, ownerId),
        "organizationId" in subject
          ? eq(workflowBoards.organizationId, subject.organizationId)
          : eq(workflowBoards.contactId, subject.contactId),
      ),
    )
    .orderBy(
      desc(workflowBoards.starred),
      desc(workflowBoards.createdAt),
      asc(workflowBoards.id),
    )
    .limit(MAX_RECORD_BOARDS);
}

export async function getBoard(ownerId: string, id: string) {
  const [board] = await db
    .select()
    .from(workflowBoards)
    .where(and(eq(workflowBoards.ownerId, ownerId), eq(workflowBoards.id, id)));
  return board ?? null;
}

// The company or the person a board was started on, with the version of their
// picture; nothing for a template.
export async function boardSubjectOf(
  ownerId: string,
  board: { organizationId: string | null; contactId: string | null },
) {
  if (board.organizationId) {
    const [company] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        pictureVersion: logoVersion,
      })
      .from(organizations)
      .where(
        and(
          eq(organizations.ownerId, ownerId),
          eq(organizations.id, board.organizationId),
        ),
      );
    return company ? { kind: "organization" as const, ...company } : null;
  }
  if (board.contactId) {
    const [person] = await db
      .select({
        id: contacts.id,
        name: contacts.fullName,
        pictureVersion: photoVersion,
      })
      .from(contacts)
      .where(
        and(eq(contacts.ownerId, ownerId), eq(contacts.id, board.contactId)),
      );
    return person ? { kind: "contact" as const, ...person } : null;
  }
  return null;
}
