"use server";

import { APIError } from "better-auth/api";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { readFields } from "@/lib/form";
import { requireOwner } from "@/lib/session";
import { profileInput, settingsInput } from "@/modules/settings/schema";
import {
  getSettings,
  saveProfile,
  saveSettings,
} from "@/modules/settings/service";

export type FormState = { ok: boolean; message: string } | null;

const PROFILE_FIELDS = [
  "name",
  "preferredName",
  "jobTitle",
  "businessName",
  "phone",
  "website",
  "location",
] as const;

export type ProfileFormState =
  | {
      ok: boolean;
      message: string;
      values: Record<(typeof PROFILE_FIELDS)[number], string>;
    }
  | null;

export async function saveProfileAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  const owner = await requireOwner();
  const values = readFields(formData, PROFILE_FIELDS);
  const parsed = profileInput.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message, values };
  }
  if (!(await saveProfile(owner.id, parsed.data))) {
    return { ok: false, message: "Finish setting up first.", values };
  }
  // The greeting and the sidebar's name are drawn by the layout.
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved.", values };
}

export async function saveSettingsAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const owner = await requireOwner();
  const parsed = settingsInput.safeParse({
    baseCurrency: formData.get("baseCurrency"),
    timezone: formData.get("timezone"),
    weekStart: formData.get("weekStart"),
    fiscalYearStartMonth: formData.get("fiscalYearStartMonth"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  const isOnboarding = !(await getSettings(owner.id));
  await saveSettings(owner.id, parsed.data);
  if (isOnboarding) redirect("/");

  revalidatePath("/settings/profile");
  return { ok: true, message: "Saved." };
}

const passwordInput = z.strictObject({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z
    .string()
    .min(12, "The new password needs at least 12 characters")
    .max(128),
});

export async function changePasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  await requireOwner();
  const parsed = passwordInput.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }

  try {
    await auth.api.changePassword({
      body: { ...parsed.data, revokeOtherSessions: true },
      headers: await headers(),
    });
  } catch (error) {
    if (error instanceof APIError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
  revalidatePath("/settings/security");
  return {
    ok: true,
    message: "Password changed. Other devices were signed out.",
  };
}

export async function revokeSessionAction(formData: FormData) {
  await requireOwner();
  const id = z.uuid().parse(formData.get("sessionId"));
  const requestHeaders = await headers();
  // Look the token up server-side so session tokens never appear in page markup.
  const sessions = await auth.api.listSessions({ headers: requestHeaders });
  const target = sessions.find((session) => session.id === id);
  if (target) {
    await auth.api.revokeSession({
      body: { token: target.token },
      headers: requestHeaders,
    });
  }
  revalidatePath("/settings/security");
}

export async function signOutAction() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/sign-in");
}
