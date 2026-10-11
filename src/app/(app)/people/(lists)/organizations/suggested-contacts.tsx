"use client";

import { useActionState } from "react";
import { Monogram } from "@/components/company-logo";
import { SECTION_HEADING } from "@/components/detail-rows";
import { FormOutcome } from "@/components/form-outcome";
import { Button } from "@/components/ui/button";
import type { RecordFormState } from "@/app/(app)/form-state";

export function SuggestedContacts({
  people,
  action,
}: {
  people: { name: string; title: string | null }[];
  action: (
    state: RecordFormState,
    formData: FormData,
  ) => Promise<RecordFormState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  // Stays mounted after the last person is added, so the outcome can be read.
  if (people.length === 0) return <FormOutcome state={state} />;

  return (
    <section
      aria-labelledby="suggested-contacts"
      className="grid gap-3 border-t pt-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <h3 id="suggested-contacts" className={SECTION_HEADING}>
            Found on the website
          </h3>
          <p className="text-sm text-muted-foreground">
            Nobody here is a contact until you add them.
          </p>
        </div>
        {people.length > 1 && (
          <form action={formAction}>
            {people.map((person) => (
              <input
                key={person.name}
                type="hidden"
                name="name"
                value={person.name}
              />
            ))}
            <Button type="submit" variant="outline" size="sm" disabled={pending}>
              Add all
            </Button>
          </form>
        )}
      </div>

      <form action={formAction}>
        <ul className="grid gap-2">
          {people.map((person) => (
            <li key={person.name} className="flex items-center gap-3">
              <Monogram name={person.name} className="rounded-full" />
              <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
                <span className="font-medium break-words">{person.name}</span>
                {person.title && (
                  <span className="break-words text-muted-foreground">
                    {person.title}
                  </span>
                )}
              </div>
              <Button
                type="submit"
                name="name"
                value={person.name}
                variant="ghost"
                size="sm"
                disabled={pending}
                aria-label={`Add ${person.name}`}
              >
                Add
              </Button>
            </li>
          ))}
        </ul>
      </form>

      <FormOutcome state={state} />
    </section>
  );
}
