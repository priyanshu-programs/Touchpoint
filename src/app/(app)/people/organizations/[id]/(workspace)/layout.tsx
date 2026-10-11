import { ButtonLink } from "@/components/button-link";
import { TabNav } from "@/components/tab-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { labelFor } from "../../../labels";
import { setOrganizationArchivedAction } from "../../actions";
import { loadOrganization } from "../load";

export default async function OrganizationWorkspaceLayout({
  children,
  params,
}: LayoutProps<"/people/organizations/[id]">) {
  const { organization } = await loadOrganization((await params).id);
  const path = `/people/organizations/${organization.id}`;

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {organization.name}
          </h1>
          <div className="flex flex-wrap gap-1">
            <Badge variant="secondary">{labelFor(organization.status)}</Badge>
            {organization.archivedAt && (
              <Badge variant="destructive">Archived</Badge>
            )}
            {organization.tags.map((tag) => (
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
          <form action={setOrganizationArchivedAction}>
            <input type="hidden" name="id" value={organization.id} />
            <input
              type="hidden"
              name="archived"
              value={organization.archivedAt ? "0" : "1"}
            />
            <Button type="submit" variant="outline">
              {organization.archivedAt ? "Restore" : "Archive"}
            </Button>
          </form>
        </div>
      </div>

      <TabNav
        label="Organization"
        tabs={[
          { href: path, label: "Overview" },
          { href: `${path}/tasks`, label: "Tasks" },
        ]}
      />
      {children}
    </div>
  );
}
