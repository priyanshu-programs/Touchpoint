import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ownerExists } from "@/lib/auth";
import { getOwner } from "@/lib/session";
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (!(await ownerExists())) redirect("/setup");
  if (await getOwner()) redirect("/");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Touchpoint</CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm mode="sign-in" />
      </CardContent>
    </Card>
  );
}
