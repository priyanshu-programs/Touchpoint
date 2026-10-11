import Form from "next/form";
import Link from "next/link";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";

const optional = <T extends z.ZodType>(schema: T) =>
  schema.optional().catch(undefined);

export const listParams = z.object({
  q: optional(z.string().trim().max(100)),
  tag: optional(z.uuid()),
  archived: optional(z.literal("1")),
  after: optional(z.uuid()),
});
type ListParams = z.infer<typeof listParams>;

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
