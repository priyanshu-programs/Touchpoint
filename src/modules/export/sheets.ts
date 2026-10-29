import { and, asc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  activities,
  brainstormBoards,
  companyStatuses,
  contacts,
  invoiceAdjustments,
  invoiceLines,
  invoices,
  materialSends,
  materialVersions,
  materials,
  organizations,
  payments,
  tasks,
  workflowBoards,
} from "@/db/schema";
import { currencyDigits } from "@/lib/money";
import { toLocalInput } from "@/lib/time";
import { getLayout, listCustomFields } from "@/modules/fields/queries";
import { isCustomKey } from "@/modules/fields/schema";
import { invoiceBalance, invoicePaid, invoiceTotal } from "@/modules/invoices/queries";
import { INVOICE_STATE_LABELS, invoiceState } from "@/modules/invoices/state";
import {
  MATERIAL_TYPE_LABELS,
  SEND_CHANNEL_LABELS,
  SEND_STATUS_LABELS,
} from "@/modules/materials/schema";
import { PAYMENT_METHOD_LABELS } from "@/modules/payments/schema";
import { BUILT_IN_STATUSES } from "@/modules/statuses/schema";
import { BOM, csvLine, type Cell } from "./csv";
import { PAGE_ROWS } from "./tables";

export type Reader = NodePgDatabase;
export type SheetContext = { ownerId: string; timezone: string; today: string };
export type Sheet = { file: string; lines: (db: Reader, context: SheetContext) => AsyncGenerator<string> };

// A spelling of the stored word the way the screens show it ("past_client" → "Past client").
const WORDS: Record<string, string> = {
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  github: "GitHub",
  x: "X",
  in_app: "In app",
};
const word = (value: string | null) =>
  value === null
    ? null
    : (WORDS[value] ?? `${value.charAt(0).toUpperCase()}${value.slice(1).replace(/_/g, " ")}`);

// An instant as the owner's clock read it.
const when = (instant: Date | null, timezone: string) =>
  instant ? toLocalInput(instant, timezone).replace("T", " ") : null;

// Whole minor units as a plain decimal in the currency's own digits ("1500.00", "1500" for JPY).
export function decimal(minor: number, currency: string) {
  const digits = currencyDigits(currency);
  if (digits === 0) return String(minor);
  const text = String(Math.abs(minor)).padStart(digits + 1, "0");
  return `${minor < 0 ? "-" : ""}${text.slice(0, -digits)}.${text.slice(-digits)}`;
}

async function* pages<T>(fetch: (offset: number) => Promise<T[]>) {
  for (let offset = 0; ; offset += PAGE_ROWS) {
    const rows = await fetch(offset);
    if (rows.length > 0) yield rows;
    if (rows.length < PAGE_ROWS) return;
  }
}

// One `; `-separated cell from a subquery, so a person's companies or tags fit in one row.
// The outer row is named in full ("contacts"."id"): a column passed in is written as a
// bare "id", which the subquery's own table would answer to.
const joined = (query: SQL) => sql<string | null>`(select string_agg(v, '; ' order by v) from (${query}) as joined(v))`;

const clientName = sql<string | null>`coalesce(${organizations.name}, ${contacts.fullName})`;

// The owner's custom fields of a kind of record, in the order the Fields panel puts them.
async function customColumns(ownerId: string, kind: "organization" | "contact") {
  const [layout, fields] = await Promise.all([getLayout(ownerId, kind), listCustomFields(ownerId, kind)]);
  const byKey = new Map(fields.map((field) => [`custom.${field.key}`, field]));
  return layout.filter(({ key }) => isCustomKey(key)).flatMap(({ key }) => byKey.get(key) ?? []);
}

const customCells = (
  fields: { key: string }[],
  values: Record<string, string | number>,
): Cell[] => fields.map(({ key }) => values[key]);

const companies: Sheet = {
  file: "companies.csv",
  async *lines(db, { ownerId, timezone }) {
    const [fields, owned] = await Promise.all([
      customColumns(ownerId, "organization"),
      db
        .select({ key: companyStatuses.key, label: companyStatuses.label })
        .from(companyStatuses)
        .where(eq(companyStatuses.ownerId, ownerId)),
    ]);
    // A built-in status keeps its own name; a row for one only holds its colour.
    const statuses = new Map(owned.map(({ key, label }) => [key, label]));
    for (const { key, label } of BUILT_IN_STATUSES) statuses.set(key, label);

    yield BOM + csvLine([
      "Name", "Domain", "Website", "Phone", "Email", "Industry", "Description", "City",
      "Region", "Country", "Status", "Tags", "People", "Archived", "Created",
      ...fields.map(({ label }) => label),
    ]);
    const rows = pages((offset) =>
      db
        .select({
          row: organizations,
          tags: joined(
            sql`select t.name::text from organization_tags ot join tags t on t.id = ot.tag_id where ot.organization_id = "organizations"."id"`,
          ),
          people: sql<number>`(select count(*)::int from contact_organizations co where co.organization_id = "organizations"."id")`,
        })
        .from(organizations)
        .where(eq(organizations.ownerId, ownerId))
        .orderBy(sql`lower(${organizations.name})`, asc(organizations.id))
        .limit(PAGE_ROWS)
        .offset(offset),
    );
    for await (const page of rows) {
      yield page
        .map(({ row, tags, people }) =>
          csvLine([
            row.name, row.domain, row.website, row.phone, row.email, row.industry,
            row.description, row.city, row.region, row.country,
            statuses.get(row.status) ?? word(row.status), tags, people,
            when(row.archivedAt, timezone), when(row.createdAt, timezone),
            ...customCells(fields, row.custom),
          ]),
        )
        .join("");
    }
  },
};

const people: Sheet = {
  file: "people.csv",
  async *lines(db, { ownerId, timezone }) {
    const fields = await customColumns(ownerId, "contact");
    yield BOM + csvLine([
      "First name", "Last name", "Title", "Department", "Email", "Other emails", "Phone",
      "Companies", "City", "Region", "Country", "Time zone", "Preferred channel", "Status",
      "Relationship", "Links", "Tags", "Archived", "Created",
      ...fields.map(({ label }) => label),
    ]);
    const rows = pages((offset) =>
      db
        .select({
          row: contacts,
          email: sql<string | null>`(select e.email::text from contact_emails e where e.contact_id = "contacts"."id" and e.is_primary limit 1)`,
          otherEmails: joined(
            sql`select e.email::text from contact_emails e where e.contact_id = "contacts"."id" and not e.is_primary`,
          ),
          companies: joined(
            sql`select o.name || coalesce(' — ' || nullif(co.job_title, ''), '') from contact_organizations co join organizations o on o.id = co.organization_id where co.contact_id = "contacts"."id"`,
          ),
          links: joined(sql`select l.url from contact_links l where l.contact_id = "contacts"."id"`),
          tags: joined(
            sql`select t.name::text from contact_tags ct join tags t on t.id = ct.tag_id where ct.contact_id = "contacts"."id"`,
          ),
        })
        .from(contacts)
        .where(eq(contacts.ownerId, ownerId))
        .orderBy(sql`lower(${contacts.fullName})`, asc(contacts.id))
        .limit(PAGE_ROWS)
        .offset(offset),
    );
    for await (const page of rows) {
      yield page
        .map(({ row, email, otherEmails, companies, links, tags }) =>
          csvLine([
            row.firstName, row.lastName, row.jobTitle, row.department, email, otherEmails,
            row.phoneE164, companies, row.city, row.region, row.country, row.timezone,
            word(row.preferredChannel), word(row.status), word(row.relationshipType), links,
            tags, when(row.archivedAt, timezone), when(row.createdAt, timezone),
            ...customCells(fields, row.custom),
          ]),
        )
        .join("");
    }
  },
};

const taskSheet: Sheet = {
  file: "tasks.csv",
  async *lines(db, { ownerId, timezone }) {
    yield BOM + csvLine([
      "Title", "Status", "Priority", "Due", "Completed", "Snoozed until", "Repeats",
      "Company", "Person", "Made by", "Notes", "Created",
    ]);
    const rows = pages((offset) =>
      db
        .select({ row: tasks, company: organizations.name, person: contacts.fullName })
        .from(tasks)
        .leftJoin(organizations, eq(organizations.id, tasks.organizationId))
        .leftJoin(contacts, eq(contacts.id, tasks.contactId))
        .where(eq(tasks.ownerId, ownerId))
        .orderBy(asc(tasks.createdAt), asc(tasks.id))
        .limit(PAGE_ROWS)
        .offset(offset),
    );
    for await (const page of rows) {
      yield page
        .map(({ row, company, person }) =>
          csvLine([
            row.title, word(row.status), word(row.priority),
            row.dueAt ? when(row.dueAt, timezone) : row.dueOn,
            when(row.completedAt, timezone), when(row.snoozedUntil, timezone),
            row.recurrenceRule, company, person, word(row.origin), row.notes,
            when(row.createdAt, timezone),
          ]),
        )
        .join("");
    }
  },
};

const activitySheet: Sheet = {
  file: "activities.csv",
  async *lines(db, { ownerId, timezone }) {
    yield BOM + csvLine([
      "When", "Kind", "Direction", "Title", "Outcome", "Notes", "Company", "People", "Source",
    ]);
    const rows = pages((offset) =>
      db
        .select({
          row: activities,
          company: organizations.name,
          people: joined(
            sql`select c.full_name from activity_contacts ac join contacts c on c.id = ac.contact_id where ac.activity_id = "activities"."id"`,
          ),
        })
        .from(activities)
        .leftJoin(organizations, eq(organizations.id, activities.organizationId))
        .where(eq(activities.ownerId, ownerId))
        .orderBy(asc(activities.occurredAt), asc(activities.id))
        .limit(PAGE_ROWS)
        .offset(offset),
    );
    for await (const page of rows) {
      yield page
        .map(({ row, company, people }) =>
          csvLine([
            when(row.occurredAt, timezone), word(row.kind), word(row.direction), row.title,
            row.outcome, row.body, company, people, word(row.source),
          ]),
        )
        .join("");
    }
  },
};

const materialSheet: Sheet = {
  file: "materials.csv",
  async *lines(db, { ownerId, timezone }) {
    yield BOM + csvLine(["Material", "Type", "Description", "Version", "Link", "File", "Added"]);
    const rows = pages((offset) =>
      db
        .select({ material: materials, version: materialVersions })
        .from(materials)
        .leftJoin(materialVersions, eq(materialVersions.materialId, materials.id))
        .where(eq(materials.ownerId, ownerId))
        .orderBy(
          sql`lower(${materials.name})`,
          asc(materials.id),
          asc(materialVersions.createdAt),
          asc(materialVersions.id),
        )
        .limit(PAGE_ROWS)
        .offset(offset),
    );
    for await (const page of rows) {
      yield page
        .map(({ material, version }) =>
          csvLine([
            material.name, MATERIAL_TYPE_LABELS[material.type], material.description,
            version?.label, version?.url, version?.fileId ? version.title : null,
            when(version?.createdAt ?? null, timezone),
          ]),
        )
        .join("");
    }
  },
};

const sendSheet: Sheet = {
  file: "material-sends.csv",
  async *lines(db, { ownerId, timezone }) {
    yield BOM + csvLine(["Sent", "Material", "Version", "Channel", "Status", "People", "Company", "Note"]);
    const rows = pages((offset) =>
      db
        .select({
          send: materialSends,
          material: materials.name,
          version: materialVersions.label,
          company: organizations.name,
          people: joined(
            sql`select c.full_name from material_send_recipients r join contacts c on c.id = r.contact_id where r.send_id = "material_sends"."id"`,
          ),
        })
        .from(materialSends)
        .innerJoin(materialVersions, eq(materialVersions.id, materialSends.versionId))
        .innerJoin(materials, eq(materials.id, materialVersions.materialId))
        .leftJoin(organizations, eq(organizations.id, materialSends.organizationId))
        .where(eq(materialSends.ownerId, ownerId))
        .orderBy(asc(materialSends.sentAt), asc(materialSends.id))
        .limit(PAGE_ROWS)
        .offset(offset),
    );
    for await (const page of rows) {
      yield page
        .map(({ send, material, version, company, people }) =>
          csvLine([
            when(send.sentAt, timezone), material, version, SEND_CHANNEL_LABELS[send.channel],
            SEND_STATUS_LABELS[send.status], people, company, send.note,
          ]),
        )
        .join("");
    }
  },
};

const invoiceOrder = [asc(invoices.issueDate), sql`lower(${invoices.number})`, asc(invoices.id)];

const invoiceSheet: Sheet = {
  file: "invoices.csv",
  async *lines(db, { ownerId, today }) {
    yield BOM + csvLine([
      "Number", "Client", "Issued", "Due", "Currency", "Total", "Paid", "Still owed", "Status",
      "Notes", "File",
    ]);
    const rows = pages((offset) =>
      db
        .select({
          row: invoices,
          client: clientName,
          total: invoiceTotal,
          paid: invoicePaid,
          balance: invoiceBalance,
        })
        .from(invoices)
        .leftJoin(organizations, eq(organizations.id, invoices.organizationId))
        .leftJoin(contacts, eq(contacts.id, invoices.contactId))
        .where(eq(invoices.ownerId, ownerId))
        .orderBy(...invoiceOrder)
        .limit(PAGE_ROWS)
        .offset(offset),
    );
    for await (const page of rows) {
      yield page
        .map(({ row, client, total, paid, balance }) =>
          csvLine([
            row.number, client, row.issueDate, row.dueDate, row.currency,
            decimal(total, row.currency), decimal(paid, row.currency),
            decimal(balance, row.currency),
            INVOICE_STATE_LABELS[invoiceState({ status: row.status, paid, balance, dueDate: row.dueDate }, today)],
            row.notes, row.fileName,
          ]),
        )
        .join("");
    }
  },
};

// Each invoice's lines and then its discounts and write-offs, invoice by invoice.
const lineSheet: Sheet = {
  file: "invoice-lines.csv",
  async *lines(db, { ownerId }) {
    yield BOM + csvLine([
      "Invoice", "Kind", "Description", "Service", "Quantity", "Price", "Amount", "Currency",
    ]);
    const owned = pages((offset) =>
      db
        .select({ id: invoices.id, number: invoices.number, currency: invoices.currency })
        .from(invoices)
        .where(eq(invoices.ownerId, ownerId))
        .orderBy(...invoiceOrder)
        .limit(PAGE_ROWS)
        .offset(offset),
    );
    for await (const page of owned) {
      const ids = page.map(({ id }) => id);
      const [lines, adjustments] = await Promise.all([
        db
          .select()
          .from(invoiceLines)
          .where(and(eq(invoiceLines.ownerId, ownerId), inArray(invoiceLines.invoiceId, ids)))
          .orderBy(asc(invoiceLines.position)),
        db
          .select()
          .from(invoiceAdjustments)
          .where(
            and(eq(invoiceAdjustments.ownerId, ownerId), inArray(invoiceAdjustments.invoiceId, ids)),
          )
          .orderBy(asc(invoiceAdjustments.position)),
      ]);
      yield page
        .map(({ id, number, currency }) =>
          [
            ...lines
              .filter((line) => line.invoiceId === id)
              .map((line) =>
                csvLine([
                  number, "Line", line.description, line.serviceCategory, line.quantity,
                  decimal(line.unitAmountMinor, currency), decimal(line.amountMinor, currency),
                  currency,
                ]),
              ),
            ...adjustments
              .filter((adjustment) => adjustment.invoiceId === id)
              .map((adjustment) =>
                csvLine([
                  number, "Discount or write-off", adjustment.reason, null, null, null,
                  decimal(adjustment.amountMinor, currency), currency,
                ]),
              ),
          ].join(""),
        )
        .join("");
    }
  },
};

const paymentSheet: Sheet = {
  file: "payments.csv",
  async *lines(db, { ownerId }) {
    yield BOM + csvLine([
      "Received", "Client", "Amount", "Currency", "Rate to base currency", "Method", "Reference",
      "Put towards invoices", "Unallocated", "Invoices paid", "Notes",
    ]);
    const allocated = sql<number>`(select coalesce(sum(pa.amount_minor), 0) from payment_allocations pa where pa.payment_id = "payments"."id")::bigint`.mapWith(Number);
    const rows = pages((offset) =>
      db
        .select({
          row: payments,
          client: clientName,
          allocated,
          // The invoice's number with what this payment put towards it, in its currency's digits
          // (worked out below from the minor units; the number and amount are kept apart here).
          paid: sql<{ number: string; minor: number }[] | null>`(
            select json_agg(json_build_object('number', i.number::text, 'minor', pa.amount_minor) order by i.issue_date, i.number)
            from payment_allocations pa join invoices i on i.id = pa.invoice_id
            where pa.payment_id = "payments"."id"
          )`,
        })
        .from(payments)
        .leftJoin(organizations, eq(organizations.id, payments.organizationId))
        .leftJoin(contacts, eq(contacts.id, payments.contactId))
        .where(eq(payments.ownerId, ownerId))
        .orderBy(asc(payments.receivedOn), asc(payments.id))
        .limit(PAGE_ROWS)
        .offset(offset),
    );
    for await (const page of rows) {
      yield page
        .map(({ row, client, allocated, paid }) =>
          csvLine([
            row.receivedOn, client, decimal(row.amountMinor, row.currency), row.currency,
            row.fxRateToBase, PAYMENT_METHOD_LABELS[row.method], row.reference,
            decimal(allocated, row.currency), decimal(row.amountMinor - allocated, row.currency),
            (paid ?? [])
              .map(({ number, minor }) => `${number} (${decimal(Number(minor), row.currency)})`)
              .join("; ") || null,
            row.notes,
          ]),
        )
        .join("");
    }
  },
};

const workflowSheet: Sheet = {
  file: "workflows.csv",
  async *lines(db, { ownerId, timezone }) {
    yield BOM + csvLine([
      "Name", "Kind", "Company or person", "Description", "Stages", "Starred", "Created",
      "Last changed",
    ]);
    const rows = pages((offset) =>
      db
        .select({
          row: workflowBoards,
          company: organizations.name,
          person: contacts.fullName,
          stages: sql<number>`jsonb_array_length(${workflowBoards.stages})`,
        })
        .from(workflowBoards)
        .leftJoin(organizations, eq(organizations.id, workflowBoards.organizationId))
        .leftJoin(contacts, eq(contacts.id, workflowBoards.contactId))
        .where(eq(workflowBoards.ownerId, ownerId))
        // The owner's workflows in their order, then the boards started on records.
        .orderBy(
          sql`${isNull(workflowBoards.organizationId)} and ${isNull(workflowBoards.contactId)} desc`,
          asc(workflowBoards.position),
          asc(workflowBoards.createdAt),
          asc(workflowBoards.id),
        )
        .limit(PAGE_ROWS)
        .offset(offset),
    );
    for await (const page of rows) {
      yield page
        .map(({ row, company, person, stages }) =>
          csvLine([
            row.name,
            company ? "On a company" : person ? "On a person" : "Workflow",
            company ?? person, row.description, stages, row.starred,
            when(row.createdAt, timezone), when(row.updatedAt, timezone),
          ]),
        )
        .join("");
    }
  },
};

const brainstormSheet: Sheet = {
  file: "brainstorm-boards.csv",
  async *lines(db, { ownerId, timezone }) {
    yield BOM + csvLine(["Name", "Elements", "Created", "Last edited"]);
    const rows = pages((offset) =>
      db
        .select()
        .from(brainstormBoards)
        .where(eq(brainstormBoards.ownerId, ownerId))
        .orderBy(sql`lower(${brainstormBoards.name})`, asc(brainstormBoards.id))
        .limit(PAGE_ROWS)
        .offset(offset),
    );
    for await (const page of rows) {
      yield page
        .map((row) =>
          csvLine([row.name, row.live, when(row.createdAt, timezone), when(row.updatedAt, timezone)]),
        )
        .join("");
    }
  },
};

// Every place a stored file is used: a box's attachment, a picture on a board, a
// material's version or an invoice. The bytes themselves are not in the export.
const fileSheet: Sheet = {
  file: "files.csv",
  async *lines(db, { ownerId, timezone }) {
    yield BOM + csvLine(["Name", "Kind", "Size (bytes)", "Used on", "Added"]);
    const rows = pages(async (offset) => {
      const result = await db.execute<{
        name: string | null;
        content_type: string;
        size: number;
        used_on: string;
        added: Date;
      }>(sql`
        select * from (
          select a.title as name, f.content_type, f.size, 'Workflow: ' || b.name::text as used_on, a.created_at as added, f.id as file_id
          from workflow_attachments a join files f on f.id = a.file_id join workflow_boards b on b.id = a.board_id
          where a.owner_id = ${ownerId}
          union all
          select null, f.content_type, f.size, 'Picture on workflow: ' || b.name::text, p.created_at, f.id
          from workflow_pictures p join files f on f.id = p.file_id join workflow_boards b on b.id = p.board_id
          where p.owner_id = ${ownerId}
          union all
          select null, f.content_type, f.size, 'Picture on brainstorm board: ' || b.name::text, p.created_at, f.id
          from brainstorm_pictures p join files f on f.id = p.file_id join brainstorm_boards b on b.id = p.board_id
          where p.owner_id = ${ownerId}
          union all
          select v.title, f.content_type, f.size, 'Material: ' || m.name::text || ' · ' || v.label, v.created_at, f.id
          from material_versions v join files f on f.id = v.file_id join materials m on m.id = v.material_id
          where v.owner_id = ${ownerId}
          union all
          select i.file_name, f.content_type, f.size, 'Invoice: ' || i.number::text, i.created_at, f.id
          from invoices i join files f on f.id = i.file_id
          where i.owner_id = ${ownerId}
        ) as used
        order by used_on, added, file_id
        limit ${PAGE_ROWS} offset ${offset}
      `);
      return result.rows;
    });
    for await (const page of rows) {
      yield page
        .map((row) =>
          csvLine([
            row.name, FILE_KINDS[row.content_type] ?? row.content_type, row.size, row.used_on,
            when(new Date(row.added), timezone),
          ]),
        )
        .join("");
    }
  },
};

const FILE_KINDS: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG picture",
  "image/jpeg": "JPEG picture",
  "image/gif": "GIF picture",
  "image/webp": "WebP picture",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "PowerPoint",
};

export const SHEETS: readonly Sheet[] = [
  companies,
  people,
  taskSheet,
  activitySheet,
  materialSheet,
  sendSheet,
  invoiceSheet,
  lineSheet,
  paymentSheet,
  workflowSheet,
  brainstormSheet,
  fileSheet,
];
