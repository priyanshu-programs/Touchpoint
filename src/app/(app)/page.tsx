import type { Metadata } from "next";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireOwner } from "@/lib/session";

export const metadata: Metadata = { title: "Today" };

export default async function TodayPage() {
  const owner = await requireOwner();

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-muted-foreground">Welcome, {owner.name}.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Nothing to review yet</CardTitle>
          <CardDescription>
            Tasks, pipeline and revenue are the next things to be built, and
            this page will show what needs your attention once they exist.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          For now you can add{" "}
          <Link href="/people/contacts" className="underline">
            contacts and organizations
          </Link>
          , or review your{" "}
          <Link href="/settings/profile" className="underline">
            profile
          </Link>
          ,{" "}
          <Link href="/settings/security" className="underline">
            security
          </Link>{" "}
          and{" "}
          <Link href="/settings/system" className="underline">
            system status
          </Link>
          .
        </CardContent>
      </Card>
    </div>
  );
}
