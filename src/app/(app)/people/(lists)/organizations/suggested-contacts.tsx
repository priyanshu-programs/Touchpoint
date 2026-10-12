"use client";

import { useActionState } from "react";
import { Monogram } from "@/components/company-logo";
import { SECTION_HEADING } from "@/components/detail-rows";
import { FormOutcome } from "@/components/form-outcome";
import { Button } from "@/components/ui/button";
import type { RecordFormState } from "@/app/(app)/form-state";

type Action = (
  state: RecordFormState,
  formData: FormData,
) => Promise<RecordFormState>;

type Person = {
  name: string;
  title: string | null;
  // Contacts this person may already be, here or at another company.
  matches: { id: string; name: string; companies: string[]; here: boolean }[];
};

export function SuggestedContacts({
  people,
  action,
  linkAction,
}: {
  people: Person[];
  action: Action;
  // Says a suggested person is one of their matches, and puts that contact here.
  linkAction: Action;
}) {
  const [state, formAction, adding] = useActionState(action, null);
  const [linked, linkFormAction, linking] = useActionState(linkAction, null);
  const pending = adding || linking;
  const outcome = (
    <>
      <FormOutcome state={state} />
      <FormOutcome state={linked} />
    </>
  );

  // Stays mounted after the last person is added, so the outcome can be read.
  if (people.length === 0) return outcome;
  // Someone who may already be a contact waits for the owner to say which.
  const unmatched = people.filter((person) => person.matches.length === 0);

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
        {unmatched.length > 1 && (
          <form action={formAction}>
            {unmatched.map((person) => (
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

      <ul className="grid gap-3">
        {people.map((person) => (
          <li key={person.name} className="grid gap-2">
            <div className="flex items-center gap-3">
              <Monogram name={person.name} className="rounded-full" />
              <div className="grid min-w-0 flex-1 gap-0.5 text-sm">
                <span className="font-medium break-words">{person.name}</span>
                {person.title && (
                  <span className="break-words text-muted-foreground">
                    {person.title}
                  </span>
                )}
              </div>
              <form action={formAction}>
                <input
                  type="hidden"
                  // Adding someone despite a look-alike is the owner saying they are new.
                  name={person.matches.length > 0 ? "confirmed" : "name"}
                  value={person.name}
                />
                <Button
                  type="submit"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  aria-label={
                    person.matches.length > 0
                      ? `Add ${person.name} as a new person`
                      : `Add ${person.name}`
                  }
                >
                  {person.matches.length > 0 ? "Add as new person" : "Add"}
                </Button>
              </form>
            </div>
            {person.matches.map((match) => (
              <form
                key={match.id}
                action={linkFormAction}
                className="ml-11 flex flex-wrap items-center gap-2 text-sm"
              >
                <input type="hidden" name="name" value={person.name} />
                <input type="hidden" name="contactId" value={match.id} />
                <span className="min-w-0 flex-1 break-words text-muted-foreground">
                  Looks like {match.name}
                  {match.companies.length > 0 &&
                    ` (${match.companies.join(", ")})`}
                </span>
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  aria-label={`${person.name} is ${match.name}`}
                >
                  {match.here ? "Same person" : "Same person, add here"}
                </Button>
              </form>
            ))}
          </li>
        ))}
      </ul>

      {outcome}
    </section>
  );
}
