import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOwner } from "@/lib/session";
import { listOrganizations } from "@/modules/organizations/queries";
import { listTags } from "@/modules/tags/queries";
import { labelFor } from "../../labels";
import { ListFilters, listParams, NextPageLink } from "../list-controls";

export const metadata: Metadata = { title: "Organizations" };

const PATH = "/people/organizations";

export default async function OrganizationsPage({
  searchParams,
}: PageProps<"/people/organizations">) {
  const owner = await requireOwner();
  const params = listParams.parse(await searchParams);
  const [page, tags] = await Promise.all([
    listOrganizations(owner.id, {
      q: params.q,
      tagId: params.tag,
      archived: params.archived === "1",
      after: params.after,
    }),
    listTags(owner.id),
  ]);
  const filtered = Boolean(params.q || params.tag || params.archived);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ListFilters path={PATH} params={params} tags={tags} />
        <ButtonLink href={`${PATH}/new`}>Add organization</ButtonLink>
      </div>

      {page.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {filtered
            ? "No organizations match these filters."
            : "No organizations yet. Add a company or agency you work with."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead className="text-right">Contacts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-normal">
                  <Link
                    href={`${PATH}/${row.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {row.name}
                  </Link>
                  {row.domain && (
                    <p className="text-muted-foreground">{row.domain}</p>
                  )}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {labelFor(row.status)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {[row.city, row.country].filter(Boolean).join(", ")}
                </TableCell>
                <TableCell className="text-right">{row.contactCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <NextPageLink path={PATH} params={params} after={page.nextAfter} />
    </div>
  );
}
