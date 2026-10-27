import { Badge } from "@/components/ui/badge";
import { INVOICE_STATE_LABELS, type InvoiceState } from "@/modules/invoices/state";

const VARIANTS = {
  draft: "outline",
  unpaid: "secondary",
  partly_paid: "secondary",
  overdue: "destructive",
  paid: "default",
  void: "ghost",
} as const;

export function InvoiceStatusPill({ state }: { state: InvoiceState }) {
  return (
    <Badge
      variant={VARIANTS[state]}
      className={state === "void" ? "text-muted-foreground" : undefined}
    >
      {INVOICE_STATE_LABELS[state]}
    </Badge>
  );
}
