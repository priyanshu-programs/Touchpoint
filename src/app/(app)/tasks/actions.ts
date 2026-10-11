"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { invalid, type RecordFormState } from "@/app/(app)/form-state";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import { taskInput } from "@/modules/tasks/schema";
import {
  cancelTask,
  completeTask,
  createTask,
  dismissReminder,
  reopenTask,
  snoozeTask,
  updateTask,
  type TaskResult,
} from "@/modules/tasks/service";

const FIELDS = [
  "title",
  "notes",
  "priority",
  "dueDate",
  "dueTime",
  "repeat",
  "repeatEvery",
  "remindAt",
  "contactId",
  "organizationId",
] as const;

// Tasks appear on Today, the task views and every linked record.
const refresh = () => revalidatePath("/", "layout");

function failure(
  result: Exclude<TaskResult, { ok: true }>,
  values: Record<string, string>,
): RecordFormState {
  if (result.reason === "not_found") notFound();
  return {
    ok: false,
    message:
      result.reason === "unknown_contact"
        ? "Choose a contact from the list."
        : "Choose a company from the list.",
    values,
  };
}

function read(formData: FormData) {
  const fields = readFields(formData, FIELDS);
  // The pickers' labels ride along only so a rejected form can show the choices again.
  const labels = readFields(formData, ["contactName", "organizationName"]);
  return { fields, values: { ...fields, ...labels } };
}

export async function createTaskAction(
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const { fields, values } = read(formData);
  const parsed = taskInput.safeParse(fields);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await createTask(owner.id, parsed.data);
  if (!result.ok) return failure(result, values);

  refresh();
  // Back to the record the task was started from, when there was one.
  const from = formData.get("from");
  if (from === "contact" && parsed.data.contactId) {
    redirect(`/people/contacts/${parsed.data.contactId}/tasks`);
  }
  if (from === "organization" && parsed.data.organizationId) {
    redirect(`/people/organizations/${parsed.data.organizationId}/tasks`);
  }
  redirect("/tasks/all");
}

export async function updateTaskAction(
  id: string,
  _previous: RecordFormState,
  formData: FormData,
): Promise<RecordFormState> {
  const owner = await requireOwner();
  const taskId = z.uuid().parse(id);
  const { fields, values } = read(formData);
  const parsed = taskInput.safeParse(fields);
  if (!parsed.success) return invalid(parsed.error, values);

  const result = await updateTask(owner.id, taskId, parsed.data);
  if (!result.ok) return failure(result, values);

  refresh();
  return { ok: true, message: "Saved." };
}

const idFrom = (formData: FormData) => z.uuid().parse(formData.get("id"));

export async function completeTaskAction(formData: FormData) {
  const owner = await requireOwner();
  await completeTask(owner.id, idFrom(formData));
  refresh();
}

export async function reopenTaskAction(formData: FormData) {
  const owner = await requireOwner();
  await reopenTask(owner.id, idFrom(formData));
  refresh();
}

export async function cancelTaskAction(formData: FormData) {
  const owner = await requireOwner();
  await cancelTask(owner.id, idFrom(formData));
  refresh();
}

export async function snoozeTaskAction(formData: FormData) {
  const owner = await requireOwner();
  const days = z
    .union([z.literal("").transform(() => null), z.coerce.number().int().min(1).max(30)])
    .parse(formData.get("days"));
  await snoozeTask(owner.id, idFrom(formData), days);
  refresh();
}

export async function dismissReminderAction(formData: FormData) {
  const owner = await requireOwner();
  await dismissReminder(owner.id, idFrom(formData));
  refresh();
}
