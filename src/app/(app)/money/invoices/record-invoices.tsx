import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { SECTION_HEADING } from "@/components/detail-rows";
import { formatDate } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { invoicesOfRecord } from "@/modules/invoices/queries";
import { ListCard } from "../../people/(lists)/list-card";
import { invoiceHref, newInvoiceHref } from "./labels";
import { InvoiceStatusPill } from "./status-pill";

// The Money tab of a company or a person: the invoices that bill them.
export async function RecordInvoices({
  ownerId,
  client,
}: {
  ownerId: string;
  client: { organizationId: string } | { contactId: string };
}) {
  const rows = await invoicesOfRecord(ownerId, client);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className={SECTION_HEADING}>Invoices</h3>
        <ButtonLink href={newInvoiceHref(client)} variant="outline" size="sm">
          New invoice
        </ButtonLink>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No invoices yet. Record one you have sent, with the PDF you exported.
        </p>
      ) : (
        <ListCard>
          <ul aria-label="Invoices">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-3 text-sm last:border-b-0"
              >
                <Link
                  href={invoiceHref(row.id)}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {row.number}
                </Link>
                <InvoiceStatusPill status={row.status} />
                <span className="text-muted-foreground">
                  {formatDate(row.issueDate)}
                </span>
                <span className="ml-auto font-medium tabular-nums">
                  {formatMoney(row.total, row.currency)}
                </span>
              </li>
            ))}
          </ul>
        </ListCard>
      )}
    </div>
  );
}
