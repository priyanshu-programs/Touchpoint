import { and, asc, desc, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { contacts, organizations, workflowBoards } from "@/db/schema";
import { photoVersion } from "@/modules/contacts/queries";
import { logoVersion } from "@/modules/organizations/queries";
import {
  MAX_PIPELINE_CARDS,
  MAX_RECORD_BOARDS,
  MAX_TEMPLATES,
  type BoardSubject,
} from "./schema";

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

// One workflow's pipeline: its stages, which give the columns, and the copies
// of it started on the owner's companies and people, newest first. Of each
// copy's drawing only the arrows are read, to tell which stage leads to which.
// One more than is shown is asked for, to know there are more.
export async function listPipeline(ownerId: string, templateId: string) {
  const [template] = await db
    .select({ stages: workflowBoards.stages })
    .from(workflowBoards)
    .where(
      and(
        eq(workflowBoards.ownerId, ownerId),
        eq(workflowBoards.id, templateId),
        isNull(workflowBoards.organizationId),
        isNull(workflowBoards.contactId),
      ),
    );
  if (!template) return null;

  const rows = await db
    .select({
      id: workflowBoards.id,
      name: workflowBoards.name,
      icon: workflowBoards.icon,
      stages: workflowBoards.stages,
      arrows: sql<Record<string, unknown>[]>`jsonb_path_query_array(
        ${workflowBoards.scene}, '$.elements[*] ? (@.type == "arrow")'
      )`,
      organizationId: organizations.id,
      organizationName: organizations.name,
      logoVersion,
      contactId: contacts.id,
      contactName: contacts.fullName,
      photoVersion,
    })
    .from(workflowBoards)
    .leftJoin(
      organizations,
      and(
        eq(organizations.id, workflowBoards.organizationId),
        eq(organizations.ownerId, ownerId),
      ),
    )
    .leftJoin(
      contacts,
      and(eq(contacts.id, workflowBoards.contactId), eq(contacts.ownerId, ownerId)),
    )
    .where(
      and(
        eq(workflowBoards.ownerId, ownerId),
        eq(workflowBoards.sourceBoardId, templateId),
        or(isNotNull(organizations.id), isNotNull(contacts.id)),
      ),
    )
    .orderBy(desc(workflowBoards.createdAt), asc(workflowBoards.id))
    .limit(MAX_PIPELINE_CARDS + 1);

  return {
    stages: template.stages,
    more: rows.length > MAX_PIPELINE_CARDS,
    boards: rows.slice(0, MAX_PIPELINE_CARDS).map(({ organizationId, contactId, ...row }) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      stages: row.stages,
      arrows: row.arrows,
      record: organizationId
        ? {
            kind: "organization" as const,
            id: organizationId,
            name: row.organizationName!,
            pictureVersion: row.logoVersion,
          }
        : {
            kind: "contact" as const,
            id: contactId!,
            name: row.contactName!,
            pictureVersion: row.photoVersion,
          },
    })),
  };
}

export async function getBoard(ownerId: string, id: string) {
  const [board] = await db
    .select()
    .from(workflowBoards)
    .where(and(eq(workflowBoards.ownerId, ownerId), eq(workflowBoards.id, id)));
  return board ?? null;
}

// The company or the person a board was started on; nothing for a template.
export async function boardSubjectOf(
  ownerId: string,
  board: { organizationId: string | null; contactId: string | null },
) {
  if (board.organizationId) {
    const [company] = await db
      .select({ id: organizations.id, name: organizations.name })
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
      .select({ id: contacts.id, name: contacts.fullName })
      .from(contacts)
      .where(
        and(eq(contacts.ownerId, ownerId), eq(contacts.id, board.contactId)),
      );
    return person ? { kind: "contact" as const, ...person } : null;
  }
  return null;
}
