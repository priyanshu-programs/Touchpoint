import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOwner } from "@/lib/session";
import { createBrainstormAction } from "../actions";
import { NameForm } from "../name-form";

export const metadata: Metadata = { title: "New brainstorm board" };

export default async function NewBrainstormPage() {
  await requireOwner();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>New brainstorm board</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <NameForm action={createBrainstormAction} name="" submitLabel="Create board" />
      </CardContent>
    </Card>
  );
}
