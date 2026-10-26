import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  getLayout,
  listCustomFields,
  optionUse,
} from "@/modules/fields/queries";
import { customKey, isCustomKey } from "@/modules/fields/schema";
import { SUGGESTED_FIELDS } from "@/modules/fields/suggested";
import { saveFieldLayoutAction } from "../fields/actions";
import { CustomFields } from "./custom-fields";
import { FieldList } from "./field-list";
import { FieldsSection } from "./fields-section";
import type { FieldsTab } from "./list-controls";
import { SuggestedFields } from "./suggested-fields";

const TABS = [
  {
    tab: "companies",
    label: "Companies",
    entityType: "organization",
    record: "company",
    records: "companies",
  },
  {
    tab: "contacts",
    label: "Contacts",
    entityType: "contact",
    record: "contact",
    records: "contacts",
  },
] as const;

const KINDS = { text: "Text", number: "Number", date: "Date" };

// What follows a field's name: the options of a dropdown, or its kind.
const detailOf = (field: { type: string; options: readonly string[] }) =>
  field.type === "select"
    ? field.options.join(", ")
    : KINDS[field.type as keyof typeof KINDS];

// What the Details of a company and of a person list, and in what order. It takes
// the place of the open record in the panel until the owner goes back.
export async function FieldsPanel({
  ownerId,
  tab,
  back,
  hrefFor,
}: {
  ownerId: string;
  tab: FieldsTab;
  back: { href: string; label: string };
  hrefFor: (tab: FieldsTab) => string;
}) {
  const current = TABS.find((item) => item.tab === tab)!;
  const [layout, defs, use] = await Promise.all([
    getLayout(ownerId, current.entityType),
    listCustomFields(ownerId, current.entityType),
    optionUse(ownerId, current.entityType),
  ]);
  const saveAction = saveFieldLayoutAction.bind(null, current.entityType);
  const standard = layout.filter(({ key }) => !isCustomKey(key));
  // In the layout's order, which is the one Details follows.
  const custom = layout.flatMap((placed) => {
    const def = defs.find(({ key }) => customKey(key) === placed.key);
    return def
      ? [
          {
            ...placed,
            id: def.id,
            detail: detailOf(def),
            options: def.options,
            uses: use[def.key] ?? {},
            isSelect: def.type === "select",
          },
        ]
      : [];
  });
  const suggested = SUGGESTED_FIELDS[current.entityType]
    .filter(
      (field) =>
        !defs.some(
          (def) => def.label.toLowerCase() === field.label.toLowerCase(),
        ),
    )
    .map((field) => ({
      key: field.key,
      label: field.label,
      detail: detailOf(field),
    }));

  return (
    <>
      <header className="grid gap-3 border-b p-4 pr-12">
        <div className="flex items-start gap-2">
          <Link
            href={back.href}
            scroll={false}
            aria-label={back.label}
            className="mt-1 rounded-md p-1 text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft aria-hidden className="size-4" />
          </Link>
          <div className="grid min-w-0 flex-1 gap-0.5">
            <SheetTitle className="text-xl">Fields</SheetTitle>
            <SheetDescription>
              This shapes every {current.record} in your CRM.
            </SheetDescription>
          </div>
        </div>
        <nav
          aria-label="Fields"
          className="flex w-fit gap-1 rounded-lg bg-muted p-1"
        >
          {TABS.map((item) => (
            <Link
              key={item.tab}
              href={hrefFor(item.tab)}
              scroll={false}
              aria-current={item.tab === tab ? "page" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
                item.tab === tab &&
                  "bg-background font-medium text-foreground shadow-sm",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>

      <FieldsSection
        title="Standard fields"
        note={`${standard.length} · reorder and hide only`}
        open
      >
        <FieldList
          key={current.entityType}
          fields={standard}
          action={saveAction}
        />
      </FieldsSection>

      {suggested.length > 0 && (
        <SuggestedFields
          key={current.entityType}
          entityType={current.entityType}
          fields={suggested}
        />
      )}

      <CustomFields
        key={current.entityType}
        entityType={current.entityType}
        record={current.record}
        records={current.records}
        fields={custom}
        saveAction={saveAction}
      />
    </>
  );
}
