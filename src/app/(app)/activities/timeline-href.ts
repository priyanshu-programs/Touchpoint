import { companyHref, contactTabHref } from "@/app/(app)/people/labels";
import type { readOrigin } from "@/lib/form";

// Back to the record a form was opened from: the company when it says so, else the
// first person on the entry, inside the company's panel when that is where they were.
export const timelineOf = (
  links: { contactIds: string[]; organizationId: string | null },
  origin: ReturnType<typeof readOrigin>,
) =>
  origin.from === "organization" && links.organizationId
    ? companyHref(links.organizationId, "activity")
    : links.contactIds[0]
      ? contactTabHref(links.contactIds[0], "activity", origin.inside)
      : links.organizationId
        ? companyHref(links.organizationId, "activity")
        : "/people/contacts";
