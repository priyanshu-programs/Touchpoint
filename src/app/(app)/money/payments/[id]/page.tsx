import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { companyHref, contactHref } from "@/app/(app)/people/labels";
import { CompanyLogo, ContactAvatar } from "@/components/company-logo";
import { formatMoney } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { getPayment, openInvoices } from "@/modules/payments/queries";
import { invoiceHref } from "../../invoices/labels";
import { PaymentDetails } from "./payment-details";
import { PaymentActions } from "./payment-actions";

const parseId = async (params: PageProps<"/money/payments/[id]">["params"]) =>
  z.uuid().safeParse((await params).id);

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

      <PaymentDetails payment={payment} open={open} invoiceHref={invoiceHref} />
    </div>
  );
}
