import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
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
import { formatCustomValue } from "@/modules/fields/format";
import { getLayout, listCustomFields } from "@/modules/fields/queries";
import { customKey } from "@/modules/fields/schema";
import { customFirstDirection, customSortOf } from "@/modules/fields/sort";
import { listTags } from "@/modules/tags/queries";
import {
  archiveContactsAction,
  deleteContactsAction,
} from "../../contacts/actions";
import { companyHref, labelFor } from "../../labels";
import {
  COLUMN_COOKIES,
  CONTACT_COLUMNS,
  CUSTOM_COLUMN_COOKIES,
  customColumns,
  hiddenColumns,
} from "../columns";
import { ContactPanel } from "../contact-panel";
import { EntryPanel, entryKey, entryMeetingId, entryTab, findEntry } from "../entry-panel";
import { FieldsPanel } from "../fields-panel";
import { ListCard, ListFooter } from "../list-card";
import {
  contactListParams,
  contactsHref,
  type ContactListParams,
} from "../list-controls";
import { ListHeader } from "../list-header";
import { ListToolbar } from "../list-toolbar";
import { MergePanel } from "../merge-panel";
import { RecordSheet } from "../record-sheet";
import { RowCheckbox, SelectAll, Selection } from "../selection";
import { SortHead } from "../sort-head";

export const metadata: Metadata = { title: "Contacts" };

const PATH = "/people/contacts";
const PAGE_SIZE = 50;
const NO_ENTRY = {
  activity: undefined,
  task: undefined,
  send: undefined,
  event: undefined,
  merge: undefined,
};
const NO_PANEL = {
  ...NO_ENTRY,
  contact: undefined,
  tab: undefined,
  earlier: undefined,
  fields: undefined,
};
// A change to what the list shows starts again from its first page, with no record open.
const FIRST_PAGE = { ...NO_PANEL, page: undefined };

// Where a column is in the order now, and the address that sorts by it: the other
// direction when it already leads, its own first direction otherwise. `params.sort`
// is already one the page resolved.
function sorting(
  params: ContactListParams,
  sort: string,
  first: "asc" | "desc",
) {
  const current = (params.sort ?? "name") === sort;
  const dir = params.dir ?? first;
  const next = current ? (dir === "asc" ? "desc" : "asc") : first;
  return {
    current: current ? dir : null,
    href: contactsHref(params, { ...FIRST_PAGE, sort, dir: next }),
  };
}

export default async function ContactsPage({
  searchParams,
}: PageProps<"/people/contacts">) {
  const owner = await requireOwner();
  const typed = contactListParams.parse(await searchParams);
  const [entry, fields, layout, jar] = await Promise.all([
    typed.contact ? findEntry(owner.id, typed) : null,
    listCustomFields(owner.id, "contact"),
    getLayout(owner.id, "contact"),
    cookies(),
  ]);
  const customSort = customSortOf(typed.sort, fields);
  // A custom field the owner does not have, or no longer has, orders nothing, and an
  // entry that is not theirs opens nothing.
  const params = {
    ...typed,
    sort: customSort ? typed.sort : undefined,
    activity: entry?.kind === "activity" ? typed.activity : undefined,
    task: entry?.kind === "task" ? typed.task : undefined,
    event: entryMeetingId(entry),
  };
  const pageNumber = params.page ?? 1;
  const [page, tags, open] = await Promise.all([
    listContacts(owner.id, {
      q: params.q,
      tagId: params.tag,
      archived: params.archived === "1",
      sort: customSort ?? "name",
      dir:
        params.dir ?? (customSort ? customFirstDirection(customSort.type) : "asc"),
      limit: PAGE_SIZE,
      offset: (pageNumber - 1) * PAGE_SIZE,
    }),
    listTags(owner.id),
    params.contact ? getContact(owner.id, params.contact) : null,
  ]);
  const hidden = hiddenColumns(
    jar.get(COLUMN_COOKIES.contacts)?.value,
    CONTACT_COLUMNS,
  );
  const shows = (column: (typeof CONTACT_COLUMNS)[number]["key"]) =>
    !hidden.includes(column);
  const custom = customColumns(
    jar.get(CUSTOM_COLUMN_COOKIES.contacts)?.value,
    fields,
    layout,
  );
  const customSorting = (field: (typeof fields)[number]) => ({
    label: field.label,
    ...sorting(params, customKey(field.key), customFirstDirection(field.type)),
  });
  const nameSorting = { label: "Name", ...sorting(params, "name", "asc") };
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
          keep={{
            tag: params.tag,
            archived: params.archived,
            sort: params.sort,
            dir: params.dir,
          }}
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
          sorts={[nameSorting, ...custom.options.map(customSorting)]}
          columns={{
            cookie: COLUMN_COOKIES.contacts,
            options: CONTACT_COLUMNS,
            hidden,
            custom: {
              cookie: CUSTOM_COLUMN_COOKIES.contacts,
              options: custom.options.map(({ key, label }) => ({ key, label })),
              shown: custom.shown.map(({ key }) => key),
            },
          }}
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
          <Selection
            ids={page.rows.map((row) => row.id)}
            noun={{ one: "person", many: "people" }}
            archived={params.archived === "1"}
            archiveAction={archiveContactsAction}
            deleteAction={deleteContactsAction}
            deleteNote="The people, their emails, links and tags are removed for good, at every company they are at, and they are taken off the activities logged with them. Their tasks are kept, no longer linked to a person. To hide them instead, use Archive."
          >
            <ListCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 p-0!">
                      <SelectAll />
                    </TableHead>
                    <SortHead {...nameSorting} />
                    {shows("company") && (
                      <TableHead className="hidden sm:table-cell">
                        Company
                      </TableHead>
                    )}
                    {shows("email") && (
                      <TableHead className="hidden md:table-cell">Email</TableHead>
                    )}
                    {shows("relationship") && (
                      <TableHead className="hidden sm:table-cell">
                        Relationship
                      </TableHead>
                    )}
                    {custom.shown.map((field) => (
                      <SortHead
                        key={field.key}
                        {...customSorting(field)}
                        className="hidden md:table-cell"
                      />
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {page.rows.map((row) => {
                    const href = contactsHref(params, {
                      ...NO_PANEL,
                      contact: row.id,
                    });
                    return (
                      <ClickableRow
                        key={row.id}
                        href={href}
                        className="has-checked:bg-muted/50"
                      >
                        <TableCell className="w-10 p-0!">
                          <RowCheckbox id={row.id} name={row.fullName} />
                        </TableCell>
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
                        {shows("company") && (
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
                        )}
                        {shows("email") && (
                          <TableCell className="hidden md:table-cell">
                            {row.primaryEmail}
                          </TableCell>
                        )}
                        {shows("relationship") && (
                          <TableCell className="hidden sm:table-cell">
                            {labelFor(row.relationshipType)}
                          </TableCell>
                        )}
                        {custom.shown.map((field) => (
                          <TableCell key={field.key} className="hidden md:table-cell">
                            {formatCustomValue(field.type, row.custom[field.key]) ??
                              "—"}
                          </TableCell>
                        ))}
                      </ClickableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ListCard>
            <ListFooter
              first={(pageNumber - 1) * PAGE_SIZE + 1}
              shown={page.rows.length}
              total={page.total}
            >
              {(pageNumber > 1 || page.hasMore) && (
                <nav aria-label="Pages" className="flex gap-4">
                  {pageNumber > 1 && (
                    <Link
                      href={contactsHref(params, {
                        ...NO_PANEL,
                        page: pageNumber === 2 ? undefined : pageNumber - 1,
                      })}
                      className="underline"
                    >
                      Previous page
                    </Link>
                  )}
                  {page.hasMore && (
                    <Link
                      href={contactsHref(params, {
                        ...NO_PANEL,
                        page: pageNumber + 1,
                      })}
                      className="underline"
                    >
                      Next page
                    </Link>
                  )}
                </nav>
              )}
            </ListFooter>
          </Selection>
        )}
      </div>

      {open && (
        <RecordSheet
          closeHref={contactsHref(params, NO_PANEL)}
          recordKey={
            params.fields
              ? "fields"
              : entry
                ? entryKey(entry)
                : params.merge
                  ? `merge:${params.merge}`
                  : open.id
          }
          narrow={Boolean(params.fields || params.merge)}
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
              notesHref={(id) =>
                contactsHref(params, { ...NO_ENTRY, activity: "new", event: id })
              }
            />
          ) : params.merge ? (
            <MergePanel
              ownerId={owner.id}
              keepId={open.id}
              otherId={params.merge}
              back={{
                href: contactsHref(params, { merge: undefined }),
                label: `Back to ${open.fullName}`,
              }}
              swapHref={(keep, other) =>
                contactsHref(params, { contact: keep, merge: other })
              }
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
