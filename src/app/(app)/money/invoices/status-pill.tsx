import { Badge } from "@/components/ui/badge";
import { INVOICE_STATE_LABELS, type InvoiceState } from "@/modules/invoices/state";

// Owing is red, partly paid orange and paid green (owner's choice, 2026-10-27);
// overdue is a solid red, so it stands out from unpaid.
const COLOURS: Record<InvoiceState, string> = {
  draft: "",
  unpaid: "border-transparent bg-red-500/10 text-red-700 dark:bg-red-500/20 dark:text-red-400",
  partly_paid: "border-transparent bg-orange-500/15 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400",
  overdue: "border-transparent bg-red-600 text-white dark:bg-red-600",
  paid: "border-transparent bg-green-500/15 text-green-700 dark:bg-green-500/20 dark:text-green-400",
  void: "border-transparent text-muted-foreground",
};

export function InvoiceStatusPill({ state }: { state: InvoiceState }) {
  return (
    <Badge variant="outline" className={COLOURS[state]}>
      {INVOICE_STATE_LABELS[state]}
    </Badge>
  );
}
