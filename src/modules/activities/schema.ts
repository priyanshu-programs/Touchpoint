import { z } from "zod";
import { ACTIVITY_DIRECTIONS, ACTIVITY_KINDS } from "@/db/schema";
import { blankToNull, text } from "@/lib/form";

export { ACTIVITY_DIRECTIONS, ACTIVITY_KINDS };

const fields = {
  kind: z.enum(ACTIVITY_KINDS),
  direction: blankToNull(z.enum(ACTIVITY_DIRECTIONS)),
  // As the owner typed it; the service turns it into an instant in the owner's time zone.
  occurredAt: z.iso.datetime({
    local: true,
    precision: -1,
    error: "Enter when it happened",
  }),
  title: z.string().trim().min(1, "Enter a short summary").max(300),
  body: blankToNull(text(10_000)),
  outcome: blankToNull(text(500)),
  contactIds: z
    .array(z.uuid())
    .max(20, "An activity can involve at most 20 contacts")
    .transform((ids) => [...new Set(ids)]),
  organizationId: blankToNull(z.uuid()),
};

type Links = { contactIds: string[]; organizationId: string | null };
// Without a link the activity would appear on no timeline at all.
const linked = (value: Links) =>
  value.contactIds.length > 0 || value.organizationId !== null;
const LINK_MESSAGE = "Choose a contact or a company";

export const activityInput = z
  .strictObject(fields)
  .refine(linked, { message: LINK_MESSAGE });

export const logActivityInput = z
  .strictObject({
    ...fields,
    followUpDate: blankToNull(z.iso.date("Enter a valid follow-up date")),
    followUpTitle: blankToNull(text(300)),
  })
  .refine(linked, { message: LINK_MESSAGE })
  .refine((value) => !value.followUpTitle || value.followUpDate, {
    message: "Choose a date for the follow-up",
  });

export type ActivityInput = z.infer<typeof activityInput>;
export type LogActivityInput = z.infer<typeof logActivityInput>;
