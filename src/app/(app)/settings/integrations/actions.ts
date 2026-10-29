"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/(app)/settings/actions";
import { canEncrypt } from "@/lib/crypto";
import { requireOwner } from "@/lib/session";
import { googleClientInput } from "@/modules/integrations/schema";
import {
  disconnectGoogle,
  removeGoogleClient,
  saveGoogleClient,
  testGoogleConnection,
} from "@/modules/integrations/service";

const PAGE = "/settings/integrations";

export async function saveGoogleClientAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const owner = await requireOwner();
  if (!canEncrypt()) {
    return { ok: false, message: "Set APP_ENCRYPTION_KEY before saving a client." };
  }
  const parsed = googleClientInput.safeParse({
    clientId: formData.get("clientId"),
    clientSecret: formData.get("clientSecret"),
  });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0].message };
  }
  await saveGoogleClient(owner.id, parsed.data);
  revalidatePath(PAGE);
  return { ok: true, message: "Client saved." };
}

export async function removeGoogleClientAction() {
  const owner = await requireOwner();
  await removeGoogleClient(owner.id);
  revalidatePath(PAGE);
}

export async function disconnectGoogleAction() {
  const owner = await requireOwner();
  await disconnectGoogle(owner.id);
  revalidatePath("/", "layout");
}

export async function testGoogleConnectionAction(): Promise<FormState> {
  const owner = await requireOwner();
  const result = await testGoogleConnection(owner.id);
  revalidatePath("/", "layout");
  return result.ok
    ? { ok: true, message: `Connected. Google shows your calendar “${result.calendar}”.` }
    : { ok: false, message: result.message };
}
