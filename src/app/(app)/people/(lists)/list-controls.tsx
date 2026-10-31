import { z } from "zod";
import { CUSTOM_SORT } from "@/modules/fields/sort";
import { ORGANIZATION_SORTS } from "@/modules/organizations/queries";

const optional = <T extends z.ZodType>(schema: T) =>
  schema.optional().catch(undefined);

export const FIELDS_TABS = ["companies", "contacts"] as const;
export type FieldsTab = (typeof FIELDS_TABS)[number];

// `fields` puts the Fields panel in place of the open record, on the tab it names.
export const listParams = z.object({
  q: optional(z.string().trim().max(100)),
  tag: optional(z.uuid()),
  archived: optional(z.literal("1")),
  after: optional(z.uuid()),
  fields: optional(z.enum(FIELDS_TABS)),
});

// `activity` and `task` put one entry in place of the open record: a new one, or the
// one with that id; `send` only a new one, since a send opens its material. `event` is a
// meeting, and with `activity=new` the meeting that new entry is filled in from;
// `schedule` only a new one. They come last, so an address reads record, tab, entry.
const entry = optional(z.union([z.literal("new"), z.uuid()]));
export type EntryParam = z.infer<typeof entry>;
// `merge` puts the open person beside another, to be merged into them.
const entryParams = {
  activity: entry,
  task: entry,
  send: optional(z.literal("new")),
  schedule: optional(z.literal("new")),
  event: optional(z.uuid()),
  merge: optional(z.uuid()),
};
const customSort = z.string().regex(CUSTOM_SORT);
const dir = optional(z.enum(["asc", "desc"]));
const page = optional(z.coerce.number().int().min(1).max(1000));

// `company` and `tab` say which company panel is open over the list; `after` pages its timeline.
// With `contact`, the panel shows that person at the company and `tab` is theirs.
export const companyListParams = listParams.extend({
  // The page checks it against the owner's statuses.
  status: optional(z.string().min(1).max(60)),
  // A custom field's key is checked against the owner's fields by the page.
  sort: optional(z.union([z.enum(ORGANIZATION_SORTS), customSort])),
  dir,
  page,
  company: optional(z.uuid()),
  contact: optional(z.uuid()),
  tab: optional(z.enum(["contacts", "activity", "tasks", "workflows", "money"])),
  ...entryParams,
});
export type CompanyListParams = z.infer<typeof companyListParams>;

// `contact` and `tab` say whose panel is open over the people list. `earlier` pages
// that person's timeline.
export const contactListParams = listParams.omit({ after: true }).extend({
  sort: optional(z.union([z.literal("name"), customSort])),
  dir,
  page,
  contact: optional(z.uuid()),
  tab: optional(z.enum(["activity", "tasks", "workflows", "money"])),
  earlier: optional(z.uuid()),
  ...entryParams,
});
export type ContactListParams = z.infer<typeof contactListParams>;

function listHref(path: string, params: Record<string, unknown>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const query = search.toString();
  return `${path}${query ? `?${query}` : ""}`;
}

export const companiesHref = (
  params: CompanyListParams,
  change: Partial<CompanyListParams> = {},
) => listHref("/people/organizations", { ...params, ...change });

export const contactsHref = (
  params: ContactListParams,
  change: Partial<ContactListParams> = {},
) => listHref("/people/contacts", { ...params, ...change });
