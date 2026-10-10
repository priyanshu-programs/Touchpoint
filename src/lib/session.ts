import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";

export const getOwner = cache(async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    sessionToken: session.session.token,
  };
});

export async function requireOwner() {
  const owner = await getOwner();
  if (!owner) redirect("/sign-in");
  return owner;
}
