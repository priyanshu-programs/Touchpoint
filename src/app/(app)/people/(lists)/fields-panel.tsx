import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { getLayout } from "@/modules/fields/queries";
import { saveFieldLayoutAction } from "../fields/actions";
import { FieldList } from "./field-list";
import type { FieldsTab } from "./list-controls";

const TABS = [
  { tab: "companies", label: "Companies", entityType: "organization" },
  { tab: "contacts", label: "Contacts", entityType: "contact" },
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
      <header className="flex items-start gap-3 border-b p-4 pr-12">
        <Link
          href={back.href}
          scroll={false}
          aria-label={back.label}
          className="mt-0.5 rounded-md p-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
        </Link>
        <div className="grid min-w-0 flex-1 gap-1">
          <SheetTitle className="text-lg">Fields</SheetTitle>
          <SheetDescription>
            Choose what Details shows and in what order. Drag a field by its
            handle, and use the eye to show or hide it.
          </SheetDescription>
        </div>
      </header>

      <nav
        aria-label="Fields"
        className="flex gap-1 overflow-x-auto border-b px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((item) => (
          <Link
            key={item.tab}
            href={hrefFor(item.tab)}
            scroll={false}
            aria-current={item.tab === tab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 border-transparent px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:text-foreground",
              item.tab === tab && "border-foreground font-medium text-foreground",
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="max-w-xl p-4">
        <FieldList
          key={current.entityType}
          fields={layout}
          action={saveFieldLayoutAction.bind(null, current.entityType)}
        />
      </div>
    </>
  );
}
