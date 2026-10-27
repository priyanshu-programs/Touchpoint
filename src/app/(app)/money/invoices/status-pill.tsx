import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/db/schema";
import { INVOICE_STATUS_LABELS } from "@/modules/invoices/schema";

const VARIANTS = {
  draft: "outline",
  issued: "secondary",
  void: "destructive",
} as const;

export function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
  return <Badge variant={VARIANTS[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>;
}
