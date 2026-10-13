"use client";

import { Plus } from "lucide-react";
import { useActionState } from "react";
import { FormMessage } from "@/components/form-message";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addStarterBoardAction } from "./actions";

// Workflows this app offers ready-made. One click adds a starter as the owner's
// own, to change as they like, after which it is no longer offered.
export function StarterTemplates({
  starters,
}: {
  starters: { key: string; name: string; description: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    addStarterBoardAction,
    null,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Starter workflows</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="grid gap-4">
          {starters.map((starter) => (
            <li key={starter.key} className="flex items-start gap-3 text-sm">
              <div className="grid min-w-0 flex-1 gap-1">
                <p className="font-medium">{starter.name}</p>
                <p className="text-muted-foreground">{starter.description}</p>
              </div>
              <form action={formAction}>
                <input type="hidden" name="key" value={starter.key} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  aria-label={`Add ${starter.name}`}
                >
                  <Plus aria-hidden />
                  Add
                </Button>
              </form>
            </li>
          ))}
        </ul>
        {state && !state.ok && <FormMessage state={state} />}
      </CardContent>
    </Card>
  );
}
