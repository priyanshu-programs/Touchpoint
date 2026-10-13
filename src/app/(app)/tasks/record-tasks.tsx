import { ButtonLink } from "@/components/button-link";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSettings } from "@/modules/settings/service";
import { listTasks } from "@/modules/tasks/queries";
import { TaskList } from "./task-list";

// The Tasks tab of a record: its open tasks and the ones most recently finished.
export async function RecordTasks({
  ownerId,
  filter,
  newHref,
  openHref,
}: {
  ownerId: string;
  filter: { contactId: string } | { organizationId: string };
  newHref: string;
  openHref: (id: string) => string;
}) {
  const timezone = (await getSettings(ownerId))?.timezone ?? "UTC";
  const [open, done] = await Promise.all([
    listTasks(ownerId, { ...filter, limit: 100 }),
    listTasks(ownerId, { ...filter, status: "done", limit: 10 }),
  ]);

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Open tasks</CardTitle>
          <CardAction>
            <ButtonLink href={newHref} scroll={false} variant="outline" size="sm">
              Add task
            </ButtonLink>
          </CardAction>
        </CardHeader>
        <CardContent>
          {open.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open tasks.</p>
          ) : (
            <TaskList tasks={open.rows} timezone={timezone} hrefFor={openHref} />
          )}
        </CardContent>
      </Card>

      {done.rows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recently done</CardTitle>
          </CardHeader>
          <CardContent>
            <TaskList tasks={done.rows} timezone={timezone} hrefFor={openHref} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
