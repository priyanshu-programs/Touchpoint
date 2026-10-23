import { z } from "zod";
import { blankToNull, emailAddress, text } from "@/lib/form";
import { contactInput, type NewContactInput } from "@/modules/contacts/schema";
import {
  organizationInput,
  type OrganizationInput,
} from "@/modules/organizations/schema";

export const COMPANY_MODES = ["new", "existing", "none"] as const;

const shared = {
  firstName: contactInput.shape.firstName,
  lastName: contactInput.shape.lastName,
  jobTitle: contactInput.shape.jobTitle,
  email: blankToNull(emailAddress),
  workflowId: blankToNull(z.uuid("Choose a workflow from the list")),
  followUpDate: blankToNull(z.iso.date("Enter a valid follow-up date")),
  followUpTitle: blankToNull(text(200)),
};

// Which fields a form sends depends on where the person works; each shape is strict.
export const quickAddInput = z.discriminatedUnion("companyMode", [
  z.strictObject({ ...shared, companyMode: z.literal("none") }),
  z.strictObject({
    ...shared,
    companyMode: z.literal("existing"),
    organizationId: z.uuid("Choose a company from the list"),
  }),
  z.strictObject({
    ...shared,
    companyMode: z.literal("new"),
    companyName: organizationInput.shape.name,
    companyWebsite: z.string().max(2000),
  }),
]);

export type QuickAddInput = z.infer<typeof quickAddInput>;

export type QuickAdd = {
  person: Omit<NewContactInput, "organizationId">;
  company:
    | { mode: "none" }
    | { mode: "existing"; id: string }
    | { mode: "new"; input: OrganizationInput };
  workflowId: string | null;
  followUp: { date: string; title: string } | null;
};

// A domain typed without its start is a website on https, as on New company.
const asWebsite = (typed: string) => {
  const value = typed.trim();
  return value && !/^[a-z][a-z0-9+.-]*:/i.test(value) ? `https://${value}` : value;
};

export function toQuickAdd(
  input: QuickAddInput,
): { ok: true; value: QuickAdd } | { ok: false; error: z.ZodError } {
  let company: QuickAdd["company"] = { mode: "none" };
  if (input.companyMode === "existing") {
    company = { mode: "existing", id: input.organizationId };
  } else if (input.companyMode === "new") {
    const website = asWebsite(input.companyWebsite);
    const parsed = organizationInput.safeParse({
      name: input.companyName,
      domain: website,
      website,
      phone: "",
      email: "",
      industry: "",
      description: "",
      city: "",
      region: "",
      country: "",
      status: "prospect",
      tags: "",
    });
    if (!parsed.success) return { ok: false, error: parsed.error };
    company = { mode: "new", input: parsed.data };
  }
  const name = [input.firstName, input.lastName].filter(Boolean).join(" ");
  return {
    ok: true,
    value: {
      person: {
        firstName: input.firstName,
        lastName: input.lastName,
        jobTitle: input.jobTitle,
        email: input.email,
        department: null,
        phoneE164: null,
        city: null,
        region: null,
        country: null,
        timezone: null,
        preferredChannel: null,
        status: "active",
        relationshipType: "prospect",
        tags: [],
      },
      company,
      workflowId: input.workflowId,
      followUp: input.followUpDate
        ? {
            date: input.followUpDate,
            title: input.followUpTitle ?? `Follow up with ${name}`,
          }
        : null,
    },
  };
}
