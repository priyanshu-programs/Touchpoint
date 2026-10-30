import type { Metadata } from "next";
import Link from "next/link";
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
        <CardDescription>Your personal business operating system</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <AuthForm mode="sign-in" />
        <p className="flex gap-4 text-sm text-muted-foreground">
          <Link href="/about" className="hover:underline">
            About
          </Link>
          <Link href="/privacy" className="hover:underline">
            Privacy
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
