import Link from "next/link";
import { LinkedText } from "@/components/linked-text";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/time";
import type { OpenInvoice, Payment } from "@/modules/payments/queries";
import { PAYMENT_METHOD_LABELS } from "@/modules/payments/schema";
import { AllocateForm } from "./allocate-form";

// A stored rate keeps eight decimals; it is shown without the ones it does not need.
const rateOf = (rate: string) => String(Number(rate));

// What a payment was and what it paid, on its own page or in the panel of the record
// that paid it. Where its invoices open is the caller's.
export function PaymentDetails({
  payment,
  open,
  invoiceHref,
}: {
  payment: Payment;
  // The client's open invoices, for what the payment did not cover.
  open: OpenInvoice[];
  invoiceHref: (id: string) => string;
}) {
  const money = (minor: number) => formatMoney(minor, payment.currency);

  return (
    <>
    <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm sm:grid-cols-4">
      <div className="grid gap-1">
        <dt className="text-xs text-muted-foreground">Received on</dt>
        <dd className="font-medium">{formatDate(payment.receivedOn)}</dd>
      </div>
      <div className="grid gap-1">
        <dt className="text-xs text-muted-foreground">How</dt>
        <dd className="font-medium">{PAYMENT_METHOD_LABELS[payment.method]}</dd>
      </div>
      <div className="grid gap-1">
        <dt className="text-xs text-muted-foreground">Reference</dt>
        <dd className="font-medium break-words">{payment.reference ?? "—"}</dd>
      </div>
      <div className="grid gap-1">
        <dt className="text-xs text-muted-foreground">Unallocated</dt>
        <dd className="font-medium tabular-nums">{money(payment.unallocated)}</dd>
      </div>
      {payment.fxRateToBase && (
        <div className="grid gap-1">
          <dt className="text-xs text-muted-foreground">Rate</dt>
          <dd className="font-medium tabular-nums">
            1 {payment.currency} = {rateOf(payment.fxRateToBase)}
          </dd>
        </div>
      )}
    </dl>

    <Card>
      <CardHeader>
        <CardTitle>Paid towards</CardTitle>
      </CardHeader>
      <CardContent>
        {payment.allocations.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Not put towards any invoice yet.
          </p>
        ) : (
          <ul aria-label="Invoices paid" className="grid gap-2 text-sm">
            {payment.allocations.map((allocation) => (
              <li
                key={allocation.invoiceId}
                className="flex flex-wrap items-center gap-x-3 gap-y-1"
              >
                <Link
                  href={invoiceHref(allocation.invoiceId)}
                  scroll={false}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {allocation.number}
                </Link>
                <span className="text-muted-foreground">
                  Due {formatDate(allocation.dueDate)}
                </span>
                <span className="ml-auto font-medium tabular-nums">
                  {money(allocation.amountMinor)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>

    {payment.unallocated > 0 && (
      <Card>
        <CardHeader>
          <CardTitle>Put towards an invoice</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Keyed by what is left, so a saved change starts the boxes again. */}
          <AllocateForm
            key={payment.unallocated}
            paymentId={payment.id}
            invoices={open}
            unallocated={payment.unallocated}
            currency={payment.currency}
          />
        </CardContent>
      </Card>
    )}

    {payment.notes && (
      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="max-w-prose break-words whitespace-pre-wrap">
            <LinkedText text={payment.notes} />
          </p>
        </CardContent>
      </Card>
    )}
    </>
  );
}
