import { ArrowLeft, ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { ContactAvatar } from "@/components/company-logo";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { contactMergePreview } from "@/modules/contacts/queries";
import {
  MERGE_FIELDS,
  fieldDiffers,
  fieldValue,
  sideFor,
} from "@/modules/contacts/merge-fields";
import { formatCustomValue } from "@/modules/fields/format";
import { getLayout, listCustomFields } from "@/modules/fields/queries";
import { customKey } from "@/modules/fields/schema";
import { labelFor } from "../labels";
import { MergeForm, type MergeRow } from "./merge-form";

const LABELLED = new Set(["status", "relationshipType", "preferredChannel"]);

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

// Two people side by side, the open one kept and the other merged into them. It takes
// the place of the person's panel until the owner goes back.
export async function MergePanel({
  ownerId,
  keepId,
  otherId,
  back,
  swapHref,
  company,
}: {
  ownerId: string;
  keepId: string;
  otherId: string;
  back: { href: string; label: string };
  // The same two the other way round; `here` says the other is at the company too.
  swapHref: (keep: string, other: string, here: boolean) => string;
  // The company whose panel this was opened in, to land back in after the merge.
  company?: string;
}) {
  const [preview, layout, customFields] = await Promise.all([
    contactMergePreview(ownerId, keepId, otherId),
    getLayout(ownerId, "contact"),
    listCustomFields(ownerId, "contact"),
  ]);
  if (!preview) {
    return (
      <header className="flex items-start gap-2 border-b p-4 pr-12">
        <Link
          href={back.href}
          scroll={false}
          aria-label={back.label}
          className="mt-1 rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
        </Link>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <SheetTitle className="text-lg">Merge</SheetTitle>
          <SheetDescription>That person is no longer here to merge.</SheetDescription>
        </div>
      </header>
    );
  }
  const { keep, other, brings } = preview;

  const rows: MergeRow[] = [];
  for (const field of MERGE_FIELDS) {
    if (!fieldDiffers(field, keep, other)) continue;
    const shown = (person: typeof keep) => {
      const value = fieldValue(field, person);
      return value && LABELLED.has(field.key) ? labelFor(value) : value || null;
    };
    rows.push({
      name: `pick.${field.key}`,
      label: field.label,
      keep: shown(keep),
      other: shown(other),
      side: sideFor(!fieldValue(field, keep), !fieldValue(field, other), undefined),
    });
  }
  const typeOf = new Map(customFields.map((field) => [customKey(field.key), field.type]));
  for (const { key, label } of layout) {
    const type = typeOf.get(key);
    const name = key.slice(customKey("").length);
    if (!type) continue;
    const [mine, theirs] = [keep.custom[name], other.custom[name]];
    if (mine === theirs) continue;
    rows.push({
      name: key,
      label,
      keep: formatCustomValue(type, mine),
      other: formatCustomValue(type, theirs),
      side: sideFor(mine === undefined, theirs === undefined, undefined),
    });
  }
  const photo = (person: typeof keep): ReactNode => (
    <ContactAvatar
      id={person.id}
      name={person.fullName}
      photoVersion={person.photoVersion}
      className="size-12 text-sm"
    />
  );
  if (keep.photoVersion && other.photoVersion && keep.photoVersion !== other.photoVersion) {
    rows.push({ name: "pick.photo", label: "Photo", keep: photo(keep), other: photo(other), side: "keep" });
  }
  const primary = (person: typeof keep) =>
    person.emails.find((email) => email.isPrimary)?.email;
  if (primary(keep) && primary(other)) {
    rows.push({
      name: "pick.primaryEmail",
      label: "Primary email",
      keep: primary(keep) ?? null,
      other: primary(other) ?? null,
      side: "keep",
    });
  }

  const keptCompanies = new Set(keep.companies.map(({ id }) => id));
  const keptTags = new Set(keep.tags.map((tag) => tag.toLowerCase()));
  const brought = [
    other.emails.length > 0 && plural(other.emails.length, "email"),
    other.links.length > 0 && plural(other.links.length, "link"),
    ...other.companies
      .filter(({ id }) => !keptCompanies.has(id))
      .map(({ name }) => `Their place at ${name}`),
    other.tags.some((tag) => !keptTags.has(tag.toLowerCase())) &&
      `Tags: ${other.tags.filter((tag) => !keptTags.has(tag.toLowerCase())).join(", ")}`,
    brings.activities > 0 && plural(brings.activities, "activity", "activities"),
    brings.tasks > 0 && plural(brings.tasks, "task"),
    brings.workflows > 0 && plural(brings.workflows, "workflow"),
    brings.sends > 0 && plural(brings.sends, "material send"),
  ].filter((line): line is string => Boolean(line));

  return (
    <>
      <header className="flex flex-wrap items-start gap-2 border-b p-4 pr-12">
        <Link
          href={back.href}
          scroll={false}
          aria-label={back.label}
          className="mt-1 rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
        </Link>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <SheetTitle className="text-lg break-words">
            Merge {other.fullName} into {keep.fullName}
          </SheetTitle>
          <SheetDescription>
            {keep.fullName} is kept. {other.fullName} is deleted once everything
            they have is moved across.
          </SheetDescription>
        </div>
        <Link
          href={swapHref(
            other.id,
            keep.id,
            other.companies.some(({ id }) => id === company),
          )}
          scroll={false}
          className="mt-1 inline-flex items-center gap-1 text-sm underline"
        >
          <ArrowLeftRight aria-hidden className="size-4" />
          Swap
        </Link>
      </header>

      <div className="p-4">
        <MergeForm
          keep={{ id: keep.id, name: keep.fullName }}
          other={{ id: other.id, name: other.fullName }}
          company={company ?? ""}
          rows={rows}
          brought={brought}
        />
      </div>
    </>
  );
}
