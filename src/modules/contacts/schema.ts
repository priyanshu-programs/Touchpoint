import { z } from "zod";
import {
  CONTACT_STATUSES,
  LINK_KINDS,
  PREFERRED_CHANNELS,
  RELATIONSHIP_TYPES,
} from "@/db/schema";
import { blankToNull, text } from "@/lib/form";
import { isTimezone } from "@/lib/time";
import { httpUrl } from "@/lib/url";
import { tagList } from "@/modules/tags/schema";

export {
  CONTACT_STATUSES,
  LINK_KINDS,
  PREFERRED_CHANNELS,
  RELATIONSHIP_TYPES,
};

const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid email address"));

const phone = z
  .string()
  .transform((value) => value.replace(/[\s().-]/g, ""))
  .refine((value) => /^\+[1-9]\d{6,14}$/.test(value), {
    message:
      "Enter the phone number in international format, such as +919876543210",
  });

export const contactInput = z.strictObject({
  firstName: z.string().trim().min(1, "Enter a first name").max(100),
  lastName: blankToNull(text(100)),
  organizationId: blankToNull(z.uuid()),
  jobTitle: blankToNull(text(150)),
  department: blankToNull(text(150)),
  phoneE164: blankToNull(phone),
  city: blankToNull(text(100)),
  region: blankToNull(text(100)),
  country: blankToNull(text(100)),
  timezone: blankToNull(
    z.string().refine(isTimezone, { message: "Choose a valid time zone" }),
  ),
  preferredChannel: blankToNull(z.enum(PREFERRED_CHANNELS)),
  status: z.enum(CONTACT_STATUSES),
  relationshipType: z.enum(RELATIONSHIP_TYPES),
  tags: tagList,
});

export const newContactInput = contactInput.extend({
  email: blankToNull(emailAddress),
});

export const contactEmailInput = z.strictObject({
  email: emailAddress,
  label: blankToNull(text(50)),
});

export const contactLinkInput = z.strictObject({
  kind: z.enum(LINK_KINDS),
  url: httpUrl,
});

export type ContactInput = z.infer<typeof contactInput>;
export type NewContactInput = z.infer<typeof newContactInput>;
export type ContactEmailInput = z.infer<typeof contactEmailInput>;
export type ContactLinkInput = z.infer<typeof contactLinkInput>;
