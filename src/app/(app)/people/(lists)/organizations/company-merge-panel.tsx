import { ArrowLeft, ArrowLeftRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { CompanyLogo } from "@/components/company-logo";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { sideFor } from "@/modules/contacts/merge-fields";
import { formatCustomValue } from "@/modules/fields/format";
import { getLayout, listCustomFields } from "@/modules/fields/queries";
import { customKey } from "@/modules/fields/schema";
import {
  MERGE_FIELDS,
  fieldDiffers,
  fieldValue,
} from "@/modules/organizations/merge-fields";
import { organizationMergePreview } from "@/modules/organizations/queries";
import { listCompanyStatuses } from "@/modules/statuses/queries";
import { mergeOrganizationsAction } from "../../organizations/actions";
import { MergeForm, type MergeRow } from "../merge-form";
import { StatusBadge } from "../status-badge";

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

// Two companies side by side, the open one kept and the other merged into it. It
// takes the place of the company's panel until the owner goes back.
export async function CompanyMergePanel({
  ownerId,
  keepId,
  otherId,
  back,
  swapHref,
}: {
  ownerId: string;
  keepId: string;
  otherId: string;
  back: { href: string; label: string };
  swapHref: (keep: string, other: string) => string;
}) {
  const [preview, layout, customFields, statuses] = await Promise.all([
    organizationMergePreview(ownerId, keepId, otherId),
    getLayout(ownerId, "organization"),
    listCustomFields(ownerId, "organization"),
    listCompanyStatuses(ownerId),
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
          <SheetDescription>That company is no longer here to merge.</SheetDescription>
        </div>
      </header>
    );
  }
  const { keep, other, brings } = preview;

  const rows: MergeRow[] = [];
  for (const field of MERGE_FIELDS) {
    if (!fieldDiffers(field, keep, other)) continue;
    const shown = (company: typeof keep): ReactNode => {
      const value = fieldValue(field, company);
      if (!value) return null;
      if (field.key === "status") {
        const status = statuses.find(({ key }) => key === value);
        return <StatusBadge label={status?.label ?? value} color={status?.color} />;
      }
      if (field.key === "website") {
        return (
          <span className="grid">
            {company.domain}
            {company.website && (
              <span className="text-xs break-all text-muted-foreground">
                {company.website}
              </span>
            )}
          </span>
        );
      }
      return field.key === "description" ? (
        <span className="line-clamp-4">{value}</span>
      ) : (
        value
      );
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
  const logo = (company: typeof keep): ReactNode => (
    <CompanyLogo
      id={company.id}
      name={company.name}
      logoVersion={company.logoVersion}
      className="size-12 text-sm"
    />
  );
  if (keep.logoVersion && other.logoVersion && keep.logoVersion !== other.logoVersion) {
    rows.push({ name: "pick.logo", label: "Logo", keep: logo(keep), other: logo(other), side: "keep" });
  }

  const keptTags = new Set(keep.tags.map((tag) => tag.toLowerCase()));
  const newTags = other.tags.filter((tag) => !keptTags.has(tag.toLowerCase()));
  const people = brings.people - brings.shared;
  const brought = [
    people > 0 && plural(people, "person", "people"),
    brings.shared > 0 &&
      `${plural(brings.shared, "person", "people")} at both, kept once`,
    newTags.length > 0 && `Tags: ${newTags.join(", ")}`,
    brings.activities > 0 && plural(brings.activities, "activity", "activities"),
    brings.tasks > 0 && plural(brings.tasks, "task"),
    brings.workflows > 0 && plural(brings.workflows, "workflow"),
    brings.sends > 0 && plural(brings.sends, "material send"),
    (other.website || other.domain) &&
      "Its website reads, if its website is the one kept",
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
            Merge {other.name} into {keep.name}
          </SheetTitle>
          <SheetDescription>
            {keep.name} is kept. {other.name} is deleted once everything it has
            is moved across.
          </SheetDescription>
        </div>
        <Link
          href={swapHref(other.id, keep.id)}
          scroll={false}
          className="mt-1 inline-flex items-center gap-1 text-sm underline"
        >
          <ArrowLeftRight aria-hidden className="size-4" />
          Swap
        </Link>
      </header>

      <div className="p-4">
        <MergeForm
          action={mergeOrganizationsAction}
          pronoun="it"
          keep={{ id: keep.id, name: keep.name }}
          other={{ id: other.id, name: other.name }}
          blocked={
            brings.reading
              ? "A website read is under way on one of them. Merge once it has finished."
              : undefined
          }
          rows={rows}
          brought={brought}
        />
      </div>
    </>
  );
}
