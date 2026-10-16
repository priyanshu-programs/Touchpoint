import { z } from "zod";
import { ENGAGEMENT_STATUSES } from "@/db/schema";
import { blankToNull, text } from "@/lib/form";
import { toMinor } from "@/lib/money";
import { CURRENCIES } from "@/modules/settings/schema";

export { ENGAGEMENT_STATUSES };

export const MAX_ENGAGEMENTS = 500;
export const MAX_ENGAGEMENT_CONTACTS = 20;

export const ENGAGEMENT_STATUS_LABELS: Record<
  (typeof ENGAGEMENT_STATUSES)[number],
  string
> = {
  planned: "Planned",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const engagementStatus = z.enum(ENGAGEMENT_STATUSES);

// The value arrives as typed; it is read in the engagement's own currency, so the
// two are checked together.
export const engagementInput = z
  .strictObject({
    organizationId: z.uuid("Choose the company the work is for"),
    title: z.string().trim().min(1, "Enter a title").max(200),
    status: engagementStatus,
    currency: z.string().refine((value) => CURRENCIES.includes(value), {
      message: "Choose a currency from the list",
    }),
    value: blankToNull(text(30)),
    paymentTerms: blankToNull(text(200)),
    startDate: blankToNull(z.iso.date("Enter a valid start date")),
    targetEndDate: blankToNull(z.iso.date("Enter a valid end date")),
    scope: blankToNull(text(5000)),
    objectives: blankToNull(text(5000)),
  })
  .refine(
    (input) =>
      !input.startDate || !input.targetEndDate || input.targetEndDate >= input.startDate,
    { message: "The end date cannot be before the start date" },
  )
  .transform(({ value, ...input }, context) => {
    const valueMinor = value === null ? null : toMinor(value, input.currency);
    if (value !== null && valueMinor === null) {
      context.addIssue({
        code: "custom",
        message: `Enter the value as an amount in ${input.currency}, such as 150000`,
      });
      return z.NEVER;
    }
    return { ...input, valueMinor };
  });

export type EngagementInput = z.output<typeof engagementInput>;

export const engagementContactInput = z.strictObject({
  contactId: z.uuid("Choose a person"),
  role: blankToNull(text(100)),
});

export type EngagementContactInput = z.infer<typeof engagementContactInput>;

const optional = <T extends z.ZodType>(schema: T) =>
  schema.optional().catch(undefined);

export const ENGAGEMENT_SORTS = ["title", "start", "end", "status"] as const;

// What `/work` is narrowed and ordered by, read from its address.
export const engagementListParams = z.object({
  q: optional(z.string().trim().max(100)),
  status: optional(engagementStatus),
  company: optional(z.uuid()),
  sort: optional(z.enum(ENGAGEMENT_SORTS)),
  dir: optional(z.enum(["asc", "desc"])),
  page: optional(z.coerce.number().int().min(1).max(1000)),
});

export type EngagementListParams = z.infer<typeof engagementListParams>;
