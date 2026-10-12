import type { EntityType } from "./schema";

// The fields every company and person has, in the order Details lists them
// until the owner arranges them.
export const STANDARD_FIELDS = {
  organization: [
    { key: "name", label: "Name" },
    { key: "domain", label: "Domain" },
    { key: "website", label: "Website" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "industry", label: "Industry" },
    { key: "city", label: "City" },
    { key: "region", label: "Region" },
    { key: "country", label: "Country" },
  ],
  contact: [
    { key: "firstName", label: "First name" },
    { key: "lastName", label: "Last name" },
    { key: "jobTitle", label: "Title" },
    { key: "department", label: "Department" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "linkedin", label: "LinkedIn" },
    { key: "x", label: "X" },
    { key: "github", label: "GitHub" },
    { key: "companies", label: "Company" },
    { key: "location", label: "Location" },
    { key: "timezone", label: "Time zone" },
    { key: "preferredChannel", label: "Preferred channel" },
  ],
} as const satisfies Record<EntityType, readonly { key: string; label: string }[]>;

export type StandardKey<Entity extends EntityType> =
  (typeof STANDARD_FIELDS)[Entity][number]["key"];
