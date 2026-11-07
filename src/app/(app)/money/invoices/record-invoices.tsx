import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { SECTION_HEADING } from "@/components/detail-rows";
import { db } from "@/db/client";
import { dateIn, formatDate } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { invoicesOfRecord } from "@/modules/invoices/queries";
import { invoiceState } from "@/modules/invoices/state";
import { paymentsOfRecord } from "@/modules/payments/queries";
import { PAYMENT_METHOD_LABELS } from "@/modules/payments/schema";
import { ownerTimezone } from "@/modules/settings/service";
import { ListCard } from "../../people/(lists)/list-card";
import { InvoiceStatusPill } from "./status-pill";

const ROW = "flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-3 text-sm last:border-b-0";

// The Invoices tab of a company or a person: the invoices that bill them, and what
// they have paid. Each opens in the record's panel, at the addresses the panel gives.
export async function RecordInvoices({
  ownerId,
  client,
  hrefs,
}: {
  ownerId: string;
  client: { organizationId: string } | { contactId: string };
  hrefs: {
    newInvoice: string;
    invoice: (id: string) => string;
    newPayment: string;
    payment: (id: string) => string;
  };
}) {
  const [rows, paid, timezone] = await Promise.all([
    invoicesOfRecord(ownerId, client),
    paymentsOfRecord(ownerId, client),
    ownerTimezone(db, ownerId),
  ]);
  const today = dateIn(timezone);

  return (
    <div className="grid gap-6">
      <section className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className={SECTION_HEADING}>Invoices</h3>
          <ButtonLink href={hrefs.newInvoice} variant="outline" size="sm" scroll={false}>
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
                <li key={row.id} className={ROW}>
                  <Link
                    href={hrefs.invoice(row.id)}
                    scroll={false}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {row.number}
                  </Link>
                  <InvoiceStatusPill state={invoiceState(row, today)} />
                  <span className="text-muted-foreground">{formatDate(row.issueDate)}</span>
                  <span className="ml-auto font-medium tabular-nums">
                    {formatMoney(row.total, row.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </ListCard>
        )}
      </section>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className={SECTION_HEADING}>Payments</h3>
          <ButtonLink href={hrefs.newPayment} variant="outline" size="sm" scroll={false}>
            Record payment
          </ButtonLink>
        </div>

        {paid.length === 0 ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <ListCard>
            <ul aria-label="Payments">
              {paid.map((row) => (
                <li key={row.id} className={ROW}>
                  <Link
                    href={hrefs.payment(row.id)}
                    scroll={false}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {formatDate(row.receivedOn)}
                  </Link>
                  <span className="text-muted-foreground">
                    {PAYMENT_METHOD_LABELS[row.method]}
                    {row.reference && ` · ${row.reference}`}
                  </span>
                  <span className="ml-auto font-medium tabular-nums">
                    {formatMoney(row.amountMinor, row.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </ListCard>
        )}
      </section>
    </div>
  );
}
