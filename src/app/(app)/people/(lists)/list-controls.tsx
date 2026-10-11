import Form from "next/form";
import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { ORGANIZATION_SORTS } from "@/modules/organizations/queries";
import { ORGANIZATION_STATUSES } from "@/modules/organizations/schema";

const optional = <T extends z.ZodType>(schema: T) =>
  schema.optional().catch(undefined);

export const listParams = z.object({
  q: optional(z.string().trim().max(100)),
  tag: optional(z.uuid()),
  archived: optional(z.literal("1")),
  after: optional(z.uuid()),
});
type ListParams = z.infer<typeof listParams>;

// `company` and `tab` say which company panel is open over the list; `after` pages its timeline.
// With `contact`, the panel shows that person at the company and `tab` is theirs.
export const companyListParams = listParams.extend({
  status: optional(z.enum(ORGANIZATION_STATUSES)),
  sort: optional(z.enum(ORGANIZATION_SORTS)),
  dir: optional(z.enum(["asc", "desc"])),
  page: optional(z.coerce.number().int().min(1).max(1000)),
  company: optional(z.uuid()),
  contact: optional(z.uuid()),
  tab: optional(z.enum(["contacts", "activity", "tasks"])),
});
export type CompanyListParams = z.infer<typeof companyListParams>;

// `contact` and `tab` say whose panel is open over the people list. `earlier` pages
// that person's timeline, since `after` already pages the list.
export const contactListParams = listParams.extend({
  contact: optional(z.uuid()),
  tab: optional(z.enum(["activity", "tasks"])),
  earlier: optional(z.uuid()),
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

export function ListFilters({
  path,
  params,
  tags,
}: {
  path: string;
  params: ListParams;
  tags: { id: string; name: string }[];
}) {
  return (
    <Form action={path} className="flex flex-wrap items-center gap-2">
      <Input
        name="q"
        type="search"
        aria-label="Search by name"
        placeholder="Search by name"
        defaultValue={params.q}
        className="w-full sm:w-56"
      />
      {tags.length > 0 && (
        <NativeSelect name="tag" aria-label="Tag" defaultValue={params.tag ?? ""}>
          <NativeSelectOption value="">All tags</NativeSelectOption>
          {tags.map((tag) => (
            <NativeSelectOption key={tag.id} value={tag.id}>
              {tag.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="archived"
          value="1"
          defaultChecked={params.archived === "1"}
        />
        Archived
      </label>
      <Button type="submit" variant="outline">
        Filter
      </Button>
    </Form>
  );
}

export function NextPageLink({
  path,
  params,
  after,
}: {
  path: string;
  params: ListParams;
  after: string | null;
}) {
  if (!after) return null;
  const search = new URLSearchParams({ after });
  if (params.q) search.set("q", params.q);
  if (params.tag) search.set("tag", params.tag);
  if (params.archived) search.set("archived", params.archived);
  return (
    <Link
      href={`${path}?${search}`}
      className="justify-self-start text-sm underline"
    >
      Next page
    </Link>
  );
}
