import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { ClickableRow } from "@/components/clickable-row";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireOwner } from "@/lib/session";
import { getContact, listContacts } from "@/modules/contacts/queries";
import { listTags } from "@/modules/tags/queries";
import { companyHref, labelFor } from "../../labels";
import { ContactPanel } from "../contact-panel";
import { FieldsPanel } from "../fields-panel";
import {
  contactListParams,
  contactsHref,
  ListFilters,
  NextPageLink,
} from "../list-controls";
import { RecordSheet } from "../record-sheet";

export const metadata: Metadata = { title: "Contacts" };

const PATH = "/people/contacts";
const NO_PANEL = {
  contact: undefined,
  tab: undefined,
  earlier: undefined,
  fields: undefined,
};

export default async function ContactsPage({
  searchParams,
}: PageProps<"/people/contacts">) {
  const owner = await requireOwner();
  const params = contactListParams.parse(await searchParams);
  const [page, tags, open] = await Promise.all([
    listContacts(owner.id, {
      q: params.q,
      tagId: params.tag,
      archived: params.archived === "1",
      after: params.after,
    }),
    listTags(owner.id),
    params.contact ? getContact(owner.id, params.contact) : null,
  ]);
  const filtered = Boolean(params.q || params.tag || params.archived);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ListFilters path={PATH} params={params} tags={tags} />
        <ButtonLink href={`${PATH}/new`}>Add contact</ButtonLink>
      </div>

      {page.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {filtered
            ? "No contacts match these filters."
            : "No contacts yet. Add the first person you want to keep in touch with."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Company</TableHead>
              <TableHead className="hidden md:table-cell">Email</TableHead>
              <TableHead className="hidden sm:table-cell">Relationship</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {page.rows.map((row) => {
              const href = contactsHref(params, {
                ...NO_PANEL,
                contact: row.id,
              });
              return (
                <ClickableRow key={row.id} href={href}>
                  <TableCell className="whitespace-normal">
                    <Link
                      href={href}
                      scroll={false}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.fullName}
                    </Link>
                    {row.jobTitle && (
                      <p className="text-muted-foreground">{row.jobTitle}</p>
                    )}
                  </TableCell>
                  <TableCell className="hidden whitespace-normal sm:table-cell">
                    <ul className="grid gap-0.5">
                      {row.companies.map((company) => (
                        <li key={company.id}>
                          <Link
                            href={companyHref(company.id)}
                            className="underline-offset-4 hover:underline"
                          >
                            {company.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {row.primaryEmail}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {labelFor(row.relationshipType)}
                  </TableCell>
                </ClickableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <NextPageLink path={PATH} params={params} after={page.nextAfter} />

      {open && (
        <RecordSheet
          closeHref={contactsHref(params, NO_PANEL)}
          recordKey={params.fields ? "fields" : open.id}
          narrow={Boolean(params.fields)}
        >
          {params.fields ? (
            <FieldsPanel
              ownerId={owner.id}
              tab={params.fields}
              back={{
                href: contactsHref(params, { fields: undefined }),
                label: `Back to ${open.fullName}`,
              }}
              hrefFor={(fields) => contactsHref(params, { fields })}
            />
          ) : (
            <ContactPanel
              ownerId={owner.id}
              contact={open}
              tab={params.tab}
              after={params.earlier}
              hrefFor={({ tab, after }) =>
                contactsHref(params, { tab, earlier: after })
              }
              fieldsHref={contactsHref(params, { fields: "contacts" })}
            />
          )}
        </RecordSheet>
      )}
    </div>
  );
}
