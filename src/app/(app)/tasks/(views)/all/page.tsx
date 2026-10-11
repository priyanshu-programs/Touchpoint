import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { cn } from "@/lib/utils";
import { getSettings } from "@/modules/settings/service";
import { listTasks } from "@/modules/tasks/queries";
import { TASK_STATUSES } from "@/modules/tasks/schema";
import { TaskList } from "../../task-list";

export const metadata: Metadata = { title: "All tasks" };

const LABELS = { open: "Open", done: "Done", cancelled: "Cancelled" };
const params = z.object({
  status: z.enum(TASK_STATUSES).catch("open"),
  after: z.uuid().optional().catch(undefined),
});

export default async function AllTasksPage({
  searchParams,
}: PageProps<"/tasks/all">) {
  const owner = await requireOwner();
  const { status, after } = params.parse(await searchParams);
  const timezone = (await getSettings(owner.id))?.timezone ?? "UTC";
  const page = await listTasks(owner.id, { status, after });

  return (
    <div className="grid gap-4">
      <nav aria-label="Status" className="flex gap-2 text-sm">
        {TASK_STATUSES.map((value) => (
          <Link
            key={value}
            href={`/tasks/all?status=${value}`}
            aria-current={value === status ? "page" : undefined}
            className={cn(
              "rounded-md border px-2 py-1 text-muted-foreground",
              value === status && "bg-muted font-medium text-foreground",
            )}
          >
            {LABELS[value]}
          </Link>
        ))}
      </nav>

      {page.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {status === "open"
            ? "No open tasks."
            : `No ${LABELS[status].toLowerCase()} tasks.`}
        </p>
      ) : (
        <TaskList tasks={page.rows} timezone={timezone} />
      )}
      {page.nextAfter && (
        <Link
          href={`/tasks/all?status=${status}&after=${page.nextAfter}`}
          className="justify-self-start text-sm underline"
        >
          Next page
        </Link>
      )}
    </div>
  );
}
