import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { companyHref, contactHref } from "@/app/(app)/people/labels";
import { CompanyLogo, ContactAvatar } from "@/components/company-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { formatDate } from "@/lib/time";
import { getPayment, openInvoices } from "@/modules/payments/queries";
import { PAYMENT_METHOD_LABELS } from "@/modules/payments/schema";
import { invoiceHref } from "../../invoices/labels";
import { AllocateForm } from "./allocate-form";
import { PaymentActions } from "./payment-actions";

const parseId = async (params: PageProps<"/money/payments/[id]">["params"]) =>
  z.uuid().safeParse((await params).id);

// A stored rate keeps eight decimals; it is shown without the ones it does not need.
const rateOf = (rate: string) => String(Number(rate));

export async function generateMetadata({
  params,
}: PageProps<"/money/payments/[id]">): Promise<Metadata> {
  const owner = await requireOwner();
  const id = await parseId(params);
  const payment = id.success ? await getPayment(owner.id, id.data) : null;
  return { title: payment ? `Payment from ${payment.clientName}` : "Payment" };
}

export default async function PaymentPage({ params }: PageProps<"/money/payments/[id]">) {
  const owner = await requireOwner();
  const id = await parseId(params);
  if (!id.success) notFound();
  const payment = await getPayment(owner.id, id.data);
  if (!payment) notFound();
  const money = (minor: number) => formatMoney(minor, payment.currency);
  const client = payment.organizationId
    ? { organizationId: payment.organizationId }
    : { contactId: payment.contactId! };
  const open =
    payment.unallocated > 0 ? await openInvoices(owner.id, client, payment.currency) : [];
  const clientHref = payment.organizationId
    ? companyHref(payment.organizationId, "money")
    : contactHref(payment.contactId!, "money");

  return (
    <div className="grid gap-6">
      <Link
        href="/money/payments"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Payments
      </Link>

      <header className="flex flex-wrap items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-2">
          <h1 className="text-2xl font-semibold tracking-tight break-words">
            {money(payment.amountMinor)} received
          </h1>
          <Link
            href={clientHref}
            className="inline-flex w-fit items-center gap-2 font-medium underline-offset-4 hover:underline"
          >
            {payment.organizationId ? (
              <CompanyLogo
                id={payment.organizationId}
                name={payment.clientName}
                logoVersion={payment.logoVersion}
                className="size-6 text-[0.625rem]"
              />
            ) : (
              <ContactAvatar
                id={payment.contactId!}
                name={payment.clientName}
                photoVersion={payment.photoVersion}
                className="size-6 text-[0.625rem]"
              />
            )}
            {payment.clientName}
          </Link>
        </div>
        <PaymentActions
          id={payment.id}
          label={`the payment of ${money(payment.amountMinor)}`}
        />
      </header>

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
            <p className="max-w-prose break-words whitespace-pre-wrap">{payment.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
