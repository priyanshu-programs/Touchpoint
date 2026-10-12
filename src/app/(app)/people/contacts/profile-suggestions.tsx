import { SECTION_HEADING } from "@/components/detail-rows";
import { Button } from "@/components/ui/button";
import type { getContact } from "@/modules/contacts/queries";
import {
  PROFILE_KINDS,
  profileSearchEnabled,
  profileSuggestions,
} from "@/modules/enrichment/profiles";
import { labelFor } from "../labels";
import { FindProfilesForm } from "./[id]/add-forms";
import { addProfileAction, dismissProfilesAction } from "./actions";

type Contact = NonNullable<Awaited<ReturnType<typeof getContact>>>;

// Profiles found by searching the person's name, for the owner to add or pass over.
export async function ProfileSuggestions({
  ownerId,
  contact,
}: {
  ownerId: string;
  contact: Contact;
}) {
  if (!profileSearchEnabled()) return null;
  const has = new Set(contact.links.map(({ kind }) => kind));
  if (PROFILE_KINDS.every((kind) => has.has(kind))) return null;
  const found = await profileSuggestions(ownerId, contact.id);

  return (
    <section aria-labelledby="contact-profiles" className="grid gap-3">
      <h3 id="contact-profiles" className={SECTION_HEADING}>
        Profile links
      </h3>
      {found.length > 0 && (
        <>
          <p className="text-sm text-muted-foreground">
            Found by name. Check each is the right person before adding it.
          </p>
          <ul className="grid gap-2">
            {found.map((profile) => (
              <li key={profile.url} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">{labelFor(profile.kind)}</span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <a
                    href={profile.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="break-all underline"
                  >
                    {profile.url.replace(/^https:\/\/(www\.)?/, "")}
                  </a>
                  {profile.title && (
                    <span className="text-xs break-words text-muted-foreground">
                      {profile.title}
                    </span>
                  )}
                </span>
                <form action={addProfileAction}>
                  <input type="hidden" name="contactId" value={contact.id} />
                  <input type="hidden" name="url" value={profile.url} />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    aria-label={`Add ${profile.url}`}
                  >
                    Add
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="flex flex-wrap items-start gap-2">
        <FindProfilesForm contactId={contact.id} />
        {found.length > 0 && (
          <form action={dismissProfilesAction}>
            <input type="hidden" name="id" value={contact.id} />
            <Button type="submit" variant="ghost" size="sm">
              Dismiss
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
