import { z } from "zod";
import { ORGANIZATION_STATUSES } from "@/db/schema";
import { blankToNull, text } from "@/lib/form";
import { httpUrl } from "@/lib/url";
import { tagList } from "@/modules/tags/schema";

export { ORGANIZATION_STATUSES };

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
  industry: blankToNull(text(100)),
  description: blankToNull(text(2000)),
  city: blankToNull(text(100)),
  region: blankToNull(text(100)),
  country: blankToNull(text(100)),
  status: z.enum(ORGANIZATION_STATUSES),
  tags: tagList,
});

export type OrganizationInput = z.infer<typeof organizationInput>;
