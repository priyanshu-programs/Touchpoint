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
import { AuthForm } from "../auth-form";

export const metadata: Metadata = { title: "Set up" };

export default async function SetupPage() {
  if (await ownerExists()) redirect("/sign-in");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome to Touchpoint</CardTitle>
        <CardDescription>
          Create the owner account for this instance. It is the only account,
          and sign-up closes once it exists.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AuthForm mode="setup" />
      </CardContent>
    </Card>
  );
}
