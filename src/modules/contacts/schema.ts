import { z } from "zod";
import {
  CONTACT_STATUSES,
  LINK_KINDS,
  PREFERRED_CHANNELS,
  RELATIONSHIP_TYPES,
} from "@/db/schema";
import { blankToNull, emailAddress, text } from "@/lib/form";
import { isTimezone } from "@/lib/time";
import { httpUrl } from "@/lib/url";
import { tagList } from "@/modules/tags/schema";

export {
  CONTACT_STATUSES,
  LINK_KINDS,
  PREFERRED_CHANNELS,
  RELATIONSHIP_TYPES,
};

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

// A new person may start at one company; more are added as links afterwards.
export const newContactInput = contactInput.extend({
  organizationId: blankToNull(z.uuid()),
  email: blankToNull(emailAddress),
});

// What is said about a person at one of their companies.
export const companyLinkInput = z.strictObject({
  jobTitle: blankToNull(text(150)),
});

export const contactEmailInput = z.strictObject({
  email: emailAddress,
  label: blankToNull(text(50)),
});

export const contactLinkInput = z.strictObject({
  kind: z.enum(LINK_KINDS),
  url: httpUrl,
});

// Which of the two people each differing field is taken from. The values themselves
// are read from the database, never from the form.
const side = z.enum(["keep", "other"]).optional();
export const contactMerge = z
  .strictObject({
    keep: z.uuid(),
    other: z.uuid(),
    picks: z.strictObject({
      firstName: side,
      lastName: side,
      jobTitle: side,
      department: side,
      phone: side,
      location: side,
      timezone: side,
      preferredChannel: side,
      status: side,
      relationshipType: side,
      photo: side,
      primaryEmail: side,
    }),
    custom: z
      .record(z.string().min(1).max(60), z.enum(["keep", "other"]))
      .refine((picks) => Object.keys(picks).length <= 50),
  })
  .refine(({ keep, other }) => keep !== other);

export type ContactInput = z.infer<typeof contactInput>;
export type ContactMerge = z.infer<typeof contactMerge>;
export type NewContactInput = z.infer<typeof newContactInput>;
export type CompanyLinkInput = z.infer<typeof companyLinkInput>;
export type ContactEmailInput = z.infer<typeof contactEmailInput>;
export type ContactLinkInput = z.infer<typeof contactLinkInput>;
