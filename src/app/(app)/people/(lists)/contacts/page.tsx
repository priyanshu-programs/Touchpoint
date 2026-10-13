import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { ClickableRow } from "@/components/clickable-row";
import { PhotoPreview } from "@/components/photo-preview";
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
import { EntryPanel, entryKey, entryTab, findEntry } from "../entry-panel";
import { FieldsPanel } from "../fields-panel";
import { ListCard, ListFooter } from "../list-card";
import {
  contactListParams,
  contactsHref,
  NextPageLink,
} from "../list-controls";
import { ListHeader } from "../list-header";
import { ListToolbar } from "../list-toolbar";
import { RecordSheet } from "../record-sheet";

export const metadata: Metadata = { title: "Contacts" };

const PATH = "/people/contacts";
const NO_ENTRY = { activity: undefined, task: undefined };
const NO_PANEL = {
  ...NO_ENTRY,
  contact: undefined,
  tab: undefined,
  earlier: undefined,
  fields: undefined,
};
// A change to what the list shows starts again from its first page, with no record open.
const FIRST_PAGE = { ...NO_PANEL, after: undefined };

export default async function ContactsPage({
  searchParams,
}: PageProps<"/people/contacts">) {
  const owner = await requireOwner();
  const typed = contactListParams.parse(await searchParams);
  const entry = typed.contact ? await findEntry(owner.id, typed) : null;
  // An entry that is not the owner's opens nothing.
  const params = {
    ...typed,
    activity: entry?.kind === "activity" ? typed.activity : undefined,
    task: entry?.kind === "task" ? typed.task : undefined,
  };
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
    <div className="grid gap-6">
      <ListHeader
        title="People"
        subtitle="Everyone you keep in touch with."
        action={
          <ButtonLink href={`${PATH}/new`}>
            <Plus aria-hidden />
            Add contact
          </ButtonLink>
        }
      />

      <div className="grid gap-4">
        <ListToolbar
          path={PATH}
          search={{
            label: "Search by name",
            placeholder: "Search people by name or email…",
            value: params.q,
          }}
          keep={{ tag: params.tag, archived: params.archived }}
          filters={
            tags.length > 0
              ? [
                  {
                    label: "Tag",
                    value: params.tag ?? "",
                    options: [
                      {
                        value: "",
                        label: "All tags",
                        href: contactsHref(params, {
                          ...FIRST_PAGE,
                          tag: undefined,
                        }),
                      },
                      ...tags.map((tag) => ({
                        value: tag.id,
                        label: tag.name,
                        href: contactsHref(params, {
                          ...FIRST_PAGE,
                          tag: tag.id,
                        }),
                      })),
                    ],
                  },
                ]
              : []
          }
          archived={{
            on: params.archived === "1",
            href: contactsHref(params, {
              ...FIRST_PAGE,
              archived: params.archived ? undefined : "1",
            }),
          }}
        />

        {page.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {filtered
              ? "No contacts match these filters."
              : "No contacts yet. Add the first person you want to keep in touch with."}
          </p>
        ) : (
          <>
            <ListCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Company
                    </TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Relationship
                    </TableHead>
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
                          <div className="flex items-center gap-3">
                            <PhotoPreview
                              id={row.id}
                              name={row.fullName}
                              photoVersion={row.photoVersion}
                              className="size-8"
                            />
                            <div className="min-w-0">
                              <Link
                                href={href}
                                scroll={false}
                                className="font-medium underline-offset-4 hover:underline"
                              >
                                {row.fullName}
                              </Link>
                              {row.jobTitle && (
                                <p className="text-muted-foreground">
                                  {row.jobTitle}
                                </p>
                              )}
                            </div>
                          </div>
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
            </ListCard>
            <ListFooter
              // A later page starts at a cursor, which does not say how many came before it.
              first={params.after ? undefined : 1}
              shown={page.rows.length}
              total={page.total}
            >
              <NextPageLink path={PATH} params={params} after={page.nextAfter} />
            </ListFooter>
          </>
        )}
      </div>

      {open && (
        <RecordSheet
          closeHref={contactsHref(params, NO_PANEL)}
          recordKey={
            params.fields ? "fields" : entry ? entryKey(entry) : open.id
          }
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
          ) : entry ? (
            <EntryPanel
              ownerId={owner.id}
              entry={entry}
              contact={open}
              organization={null}
              back={{
                href: contactsHref(params, {
                  ...NO_ENTRY,
                  tab: entryTab(entry),
                  earlier: undefined,
                }),
                label: `Back to ${open.fullName}`,
              }}
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
              entryHref={(change) => contactsHref(params, change)}
              fieldsHref={contactsHref(params, { fields: "contacts" })}
            />
          )}
        </RecordSheet>
      )}
    </div>
  );
}
