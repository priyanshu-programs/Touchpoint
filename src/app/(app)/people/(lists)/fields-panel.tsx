import { ArrowLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getLayout } from "@/modules/fields/queries";
import { saveFieldLayoutAction } from "../fields/actions";
import { FieldList } from "./field-list";
import type { FieldsTab } from "./list-controls";

const TABS = [
  {
    tab: "companies",
    label: "Companies",
    entityType: "organization",
    record: "company",
  },
  { tab: "contacts", label: "Contacts", entityType: "contact", record: "contact" },
] as const;

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
  const layout = await getLayout(ownerId, current.entityType);

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

      <details open className="group border-b">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden
            className="size-4 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none"
          />
          <span className="font-medium">Standard fields</span>
          <span className="ml-auto text-muted-foreground">
            {layout.length} · reorder and hide only
          </span>
        </summary>
        <div className="border-t bg-muted/30 px-3 py-2">
          <FieldList
            key={current.entityType}
            fields={layout}
            action={saveFieldLayoutAction.bind(null, current.entityType)}
          />
        </div>
      </details>
    </>
  );
}
