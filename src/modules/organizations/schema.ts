import { z } from "zod";
import { blankToNull, emailAddress, phoneNumber, text } from "@/lib/form";
import { httpUrl } from "@/lib/url";
import { tagList } from "@/modules/tags/schema";

const DOMAIN =
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

// "https://www.Example.com/about" and "example.com" are the same organization.
export function normalizeDomain(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#:].*$/, "");
}

export const organizationInput = z.strictObject({
  name: z.string().trim().min(1, "Enter the company's name").max(200),
  domain: blankToNull(
    z
      .string()
      .transform(normalizeDomain)
      .refine((value) => DOMAIN.test(value), {
        message: "Enter a domain such as example.com",
      }),
  ),
  website: blankToNull(httpUrl),
  phone: blankToNull(phoneNumber),
  email: blankToNull(emailAddress),
  industry: blankToNull(text(100)),
  description: blankToNull(text(2000)),
  city: blankToNull(text(100)),
  region: blankToNull(text(100)),
  country: blankToNull(text(100)),
  // A built-in status or one of the owner's own; the service checks which exist.
  status: z.string().min(1).max(60),
  tags: tagList,
});

// Which of the two companies each differing field is taken from. The values themselves
// are read from the database, never from the form.
const side = z.enum(["keep", "other"]).optional();
export const organizationMerge = z
  .strictObject({
    keep: z.uuid(),
    other: z.uuid(),
    picks: z.strictObject({
      name: side,
      website: side,
      phone: side,
      email: side,
      industry: side,
      description: side,
      location: side,
      status: side,
      logo: side,
    }),
    custom: z
      .record(z.string().min(1).max(60), z.enum(["keep", "other"]))
      .refine((picks) => Object.keys(picks).length <= 50),
  })
  .refine(({ keep, other }) => keep !== other);

export type OrganizationInput = z.infer<typeof organizationInput>;
export type OrganizationMerge = z.infer<typeof organizationMerge>;
