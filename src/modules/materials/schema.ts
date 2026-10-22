import { z } from "zod";
import {
  MATERIAL_TYPES,
  SEND_CHANNELS,
  SEND_STATUSES,
  type MaterialType,
  type SendChannel,
  type SendStatus,
} from "@/db/schema";
import { blankToNull, text } from "@/lib/form";
import { httpUrl } from "@/lib/url";

export { MATERIAL_TYPES, SEND_CHANNELS, SEND_STATUSES };

export const MAX_MATERIALS = 500;
export const MAX_MATERIAL_VERSIONS = 50;
export const MATERIAL_UPLOADS_PER_MINUTE = 30;
export const MAX_VERSION_TITLE = 200;
export const MAX_SEND_RECIPIENTS = 20;
export const SENDS_PER_MINUTE = 30;

export const SEND_CHANNEL_LABELS: Record<SendChannel, string> = {
  email: "Email",
  whatsapp: "WhatsApp",
  linkedin: "LinkedIn",
  in_person: "In person",
  other: "Other",
};

export const SEND_STATUS_LABELS: Record<SendStatus, string> = {
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  rejected: "Rejected",
  superseded: "Superseded",
};

export const MATERIAL_TYPE_LABELS: Record<MaterialType, string> = {
  proposal: "Proposal",
  quote: "Quote",
  deck: "Deck",
  portfolio: "Portfolio",
  contract: "Contract",
  report: "Report",
  design: "Design",
  deliverable: "Deliverable",
  link: "Link",
  other: "Other",
};

export const materialType = z.enum(MATERIAL_TYPES, "Choose a type from the list");

export const versionLabel = z
  .string()
  .trim()
  .min(1, "Give the version a label, such as v1")
  .max(100, "A version label can be at most 100 characters");

export const materialInput = z.strictObject({
  name: z.string().trim().min(1, "Give the material a name").max(200),
  type: materialType,
  description: blankToNull(text(2000)),
});
export type MaterialInput = z.infer<typeof materialInput>;

// A new material may start with a link as its first version.
export const newMaterialInput = materialInput.extend({
  url: blankToNull(httpUrl),
  label: blankToNull(versionLabel),
});
export type NewMaterialInput = z.infer<typeof newMaterialInput>;

export const versionLink = z.strictObject({
  label: versionLabel,
  url: httpUrl,
});
export type VersionLink = z.infer<typeof versionLink>;

// A version's new label, and a link in place of what it held; no link keeps it.
export const versionEdit = z.strictObject({
  label: versionLabel,
  url: blankToNull(httpUrl),
});
export type VersionEdit = z.infer<typeof versionEdit>;

export const versionRef = z.strictObject({
  materialId: z.uuid(),
  versionId: z.uuid(),
});
export type VersionRef = z.infer<typeof versionRef>;

export const sendInput = z.strictObject({
  versionId: z.uuid("Choose a material and a version"),
  // As the owner typed it; the service turns it into an instant in the owner's time zone.
  sentAt: z.iso.datetime({ local: true, precision: -1, error: "Enter when it was sent" }),
  channel: z.enum(SEND_CHANNELS, "Choose how it was sent"),
  contactIds: z
    .array(z.uuid())
    .min(1, "Choose who it went to")
    .max(MAX_SEND_RECIPIENTS, `A send can go to at most ${MAX_SEND_RECIPIENTS} people`)
    .transform((ids) => [...new Set(ids)]),
  organizationId: blankToNull(z.uuid()),
  note: blankToNull(text(2000)),
});
export type SendInput = z.infer<typeof sendInput>;

export const sendStatus = z.enum(SEND_STATUSES);

const optional = <T extends z.ZodType>(schema: T) =>
  schema.optional().catch(undefined);

export const MATERIAL_SORTS = ["name", "type", "updated"] as const;

// What `/materials` is narrowed and ordered by, read from its address.
export const materialListParams = z.object({
  q: optional(z.string().trim().max(100)),
  type: optional(materialType),
  sort: optional(z.enum(MATERIAL_SORTS)),
  dir: optional(z.enum(["asc", "desc"])),
  page: optional(z.coerce.number().int().min(1).max(1000)),
});
export type MaterialListParams = z.infer<typeof materialListParams>;
