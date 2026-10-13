import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireOwner } from "@/lib/session";
import { getSettings } from "@/modules/settings/service";
import { getTask } from "@/modules/tasks/queries";
import { TaskEditor } from "../task-editor";

export const metadata: Metadata = { title: "Task" };

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const owner = await requireOwner();
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const [task, settings] = await Promise.all([
    getTask(owner.id, id.data),
    getSettings(owner.id),
  ]);
  if (!task) notFound();

  return (
    <TaskEditor
      task={task}
      timezone={settings?.timezone ?? "UTC"}
      cancelHref="/tasks"
      heading={
        <h1 className="text-2xl font-semibold tracking-tight break-words">
          {task.title}
        </h1>
      }
    />
  );
}
