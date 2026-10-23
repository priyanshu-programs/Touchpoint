import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db/client";
import {
  contactOrganizations,
  contacts,
  organizations,
  tasks,
  workflowBoards,
} from "@/db/schema";
import { newContactInput } from "@/modules/contacts/schema";
import { createContact } from "@/modules/contacts/service";
import { organizationInput } from "@/modules/organizations/schema";
import { createOrganization } from "@/modules/organizations/service";
import { saveSettings } from "@/modules/settings/service";
import { addStarterBoard, startBoard } from "@/modules/workflows/boards";
import { createTestOwner, resetDatabase } from "@/test/owner";
import { quickAddInput, toQuickAdd } from "./schema";
import { quickAdd } from "./service";

const blank = {
  firstName: "Meera",
  lastName: "Iyer",
  jobTitle: "",
  email: "",
  workflowId: "",
  followUpDate: "",
  followUpTitle: "",
};

function build(form: Record<string, string>) {
  const input = toQuickAdd(quickAddInput.parse(form));
  if (!input.ok) throw input.error;
  return input.value;
}

describe("quickAddInput", () => {
  it.each([
    ["an unknown company mode", { ...blank, companyMode: "maybe" }],
    ["an existing company that is not an id", { ...blank, companyMode: "existing", organizationId: "acme" }],
    ["a company name without a new company", { ...blank, companyMode: "none", companyName: "Acme" }],
    ["an unexpected field", { ...blank, companyMode: "none", status: "lead" }],
    ["a missing first name", { ...blank, firstName: " ", companyMode: "none" }],
    ["a follow-up date that does not exist", { ...blank, followUpDate: "2026-02-30", companyMode: "none" }],
  ])("rejects %s", (_label, form) => {
    expect(quickAddInput.safeParse(form).success).toBe(false);
  });

  it("reads a typed domain as the company's website and domain", () => {
    const value = build({
      ...blank,
      companyMode: "new",
      companyName: "Lotus Labs",
      companyWebsite: "www.LotusLabs.test/about",
    });
    expect(value.company).toMatchObject({
      mode: "new",
      input: { domain: "lotuslabs.test", website: "https://www.LotusLabs.test/about" },
    });
  });

  it("names the follow-up after the person unless a title is given", () => {
    expect(build({ ...blank, companyMode: "none", followUpDate: "2026-11-01" }).followUp).toEqual({
      date: "2026-11-01",
      title: "Follow up with Meera Iyer",
    });
    expect(
      build({ ...blank, companyMode: "none", followUpDate: "2026-11-01", followUpTitle: "Send deck" })
        .followUp?.title,
    ).toBe("Send deck");
    expect(build({ ...blank, companyMode: "none" }).followUp).toBeNull();
  });
});

describe("quickAdd", () => {
  let ownerId: string;
  let prospecting: string;

  beforeEach(async () => {
    await resetDatabase();
    ownerId = await createTestOwner();
    await saveSettings(ownerId, {
      baseCurrency: "INR",
      timezone: "Asia/Kolkata",
      weekStart: 1,
      fiscalYearStartMonth: 4,
    });
    const starter = await addStarterBoard(ownerId, "prospecting");
    if (!starter.ok) throw new Error("starter refused");
    prospecting = starter.id;
  });

  const counts = async () => ({
    organizations: (await db.select().from(organizations)).length,
    contacts: (await db.select().from(contacts)).length,
    boards: (await db.select().from(workflowBoards)).length,
    tasks: (await db.select().from(tasks)).length,
  });

  async function company(name: string, domain = "", owner = ownerId) {
    const result = await createOrganization(
      owner,
      organizationInput.parse({
        name,
        domain,
        website: "",
        phone: "",
        email: "",
        industry: "",
        description: "",
        city: "",
        region: "",
        country: "",
        status: "prospect",
        tags: "",
      }),
    );
    if (!result.ok) throw new Error(result.reason);
    return result.id;
  }

  it("adds a person alone, with no workflow and no task", async () => {
    const result = await quickAdd(ownerId, build({ ...blank, companyMode: "none" }));
    expect(result).toMatchObject({ ok: true, organizationId: null });
    expect(await counts()).toEqual({ organizations: 0, contacts: 1, boards: 1, tasks: 0 });
  });

  it("adds a new company, the person starred there, the workflow on the company and the follow-up", async () => {
    const result = await quickAdd(
      ownerId,
      build({
        ...blank,
        email: "meera@lotuslabs.test",
        companyMode: "new",
        companyName: "Lotus Labs",
        companyWebsite: "lotuslabs.test",
        workflowId: prospecting,
        followUpDate: "2026-11-01",
      }),
    );
    if (!result.ok) throw new Error(result.reason);
    const organizationId = result.organizationId!;

    const [link] = await db
      .select()
      .from(contactOrganizations)
      .where(eq(contactOrganizations.contactId, result.contactId));
    expect(link).toMatchObject({ organizationId, isPrimary: true });

    const boards = await db
      .select()
      .from(workflowBoards)
      .where(eq(workflowBoards.organizationId, organizationId));
    expect(boards).toHaveLength(1);
    expect(boards[0]).toMatchObject({ sourceBoardId: prospecting, contactId: null });

    const [task] = await db.select().from(tasks);
    expect(task).toMatchObject({
      origin: "follow_up",
      dueOn: "2026-11-01",
      title: "Follow up with Meera Iyer",
      contactId: result.contactId,
      organizationId,
    });
  });

  it("puts the person at an existing company", async () => {
    const acme = await company("Acme Design", "acme.test");
    const result = await quickAdd(
      ownerId,
      build({ ...blank, companyMode: "existing", organizationId: acme }),
    );
    expect(result).toMatchObject({ ok: true, organizationId: acme });
    expect((await counts()).organizations).toBe(1);
  });

  it("starts the workflow on the person when there is no company", async () => {
    const result = await quickAdd(
      ownerId,
      build({ ...blank, companyMode: "none", workflowId: prospecting }),
    );
    if (!result.ok) throw new Error(result.reason);
    const boards = await db
      .select()
      .from(workflowBoards)
      .where(eq(workflowBoards.contactId, result.contactId));
    expect(boards).toHaveLength(1);
  });

  it("refuses a domain or an email already held, writing nothing", async () => {
    await company("Acme Design", "acme.test");
    const person = await createContact(
      ownerId,
      newContactInput.parse({
        firstName: "Priya",
        lastName: "Sharma",
        jobTitle: "",
        department: "",
        phoneE164: "",
        city: "",
        region: "",
        country: "",
        timezone: "",
        preferredChannel: "",
        status: "active",
        relationshipType: "prospect",
        tags: "",
        organizationId: "",
        email: "priya@acme.test",
      }),
    );
    if (!person.ok) throw new Error(person.reason);
    const before = await counts();

    expect(
      await quickAdd(
        ownerId,
        build({
          ...blank,
          companyMode: "new",
          companyName: "Acme Again",
          companyWebsite: "https://acme.test",
          workflowId: prospecting,
          followUpDate: "2026-11-01",
        }),
      ),
    ).toMatchObject({ ok: false, reason: "duplicate", kind: "company", existing: { name: "Acme Design" } });

    expect(
      await quickAdd(
        ownerId,
        build({
          ...blank,
          email: "PRIYA@acme.test",
          companyMode: "new",
          companyName: "Fresh Co",
          companyWebsite: "fresh.test",
          followUpDate: "2026-11-01",
        }),
      ),
    ).toMatchObject({ ok: false, reason: "duplicate", kind: "person", existing: { id: person.id } });

    expect(await counts()).toEqual(before);
  });

  it("asks before adding a look-alike company or person, and adds them once confirmed", async () => {
    await company("Lotus Laboratories");
    const form = build({ ...blank, companyMode: "new", companyName: "Lotus Laboratory", companyWebsite: "" });
    expect(await quickAdd(ownerId, form)).toMatchObject({ ok: false, reason: "similar", kind: "company" });

    const first = await quickAdd(ownerId, build({ ...blank, companyMode: "none" }));
    expect(first.ok).toBe(true);
    const again = build({ ...blank, firstName: "Meera", lastName: "Iyerr", companyMode: "none" });
    expect(await quickAdd(ownerId, again)).toMatchObject({ ok: false, reason: "similar", kind: "person" });
    expect((await counts()).contacts).toBe(1);

    expect((await quickAdd(ownerId, again, { confirmSimilar: true })).ok).toBe(true);
    expect((await counts()).contacts).toBe(2);
  });

  it("refuses another owner's company or workflow, and a record's board as the workflow", async () => {
    const other = await createTestOwner("other@example.com");
    const theirs = await company("Theirs", "", other);
    const theirStarter = await addStarterBoard(other, "prospecting");
    if (!theirStarter.ok) throw new Error("starter refused");
    const mine = await company("Mine");
    const board = await startBoard(ownerId, { organizationId: mine }, { templateId: prospecting });
    if (!board.ok) throw new Error(board.reason);
    const before = await counts();

    expect(
      await quickAdd(ownerId, build({ ...blank, companyMode: "existing", organizationId: theirs })),
    ).toEqual({ ok: false, reason: "unknown_organization" });
    expect(
      await quickAdd(ownerId, build({ ...blank, companyMode: "none", workflowId: theirStarter.id })),
    ).toEqual({ ok: false, reason: "unknown_workflow" });
    expect(
      await quickAdd(ownerId, build({ ...blank, companyMode: "none", workflowId: board.id })),
    ).toEqual({ ok: false, reason: "unknown_workflow" });
    expect(await counts()).toEqual(before);
  });
});
