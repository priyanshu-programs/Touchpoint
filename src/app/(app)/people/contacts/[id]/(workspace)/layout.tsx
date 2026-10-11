import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { TabNav } from "@/components/tab-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { companyHref, labelFor } from "../../../labels";
import { setContactArchivedAction } from "../../actions";
import { loadContact } from "../load";

export default async function ContactWorkspaceLayout({
  children,
  params,
}: LayoutProps<"/people/contacts/[id]">) {
  const { contact } = await loadContact((await params).id);
  const path = `/people/contacts/${contact.id}`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {contact.fullName}
          </h1>
          {(contact.jobTitle || contact.organizationId) && (
            <p className="text-muted-foreground">
              {contact.jobTitle}
              {contact.jobTitle && contact.organizationId && " at "}
              {contact.organizationId && (
                <Link
                  href={companyHref(contact.organizationId)}
                  className="underline"
                >
                  {contact.organizationName}
                </Link>
              )}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary">
              {labelFor(contact.relationshipType)}
            </Badge>
            {contact.status !== "active" && (
              <Badge variant="outline">{labelFor(contact.status)}</Badge>
            )}
            {contact.archivedAt && <Badge variant="destructive">Archived</Badge>}
            {contact.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <ButtonLink href={`${path}/edit`} variant="outline">
            Edit
          </ButtonLink>
          <form action={setContactArchivedAction}>
            <input type="hidden" name="id" value={contact.id} />
            <input
              type="hidden"
              name="archived"
              value={contact.archivedAt ? "0" : "1"}
            />
            <Button type="submit" variant="outline">
              {contact.archivedAt ? "Restore" : "Archive"}
            </Button>
          </form>
        </div>
      </div>

      <TabNav
        label="Contact"
        tabs={[
          { href: path, label: "Overview" },
          { href: `${path}/timeline`, label: "Timeline" },
          { href: `${path}/tasks`, label: "Tasks" },
        ]}
      />
      {children}
    </div>
  );
}
