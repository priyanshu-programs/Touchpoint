import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { companyHref, contactHref } from "@/app/(app)/people/labels";
import { CompanyLogo, ContactAvatar } from "@/components/company-logo";
import { db } from "@/db/client";
import { requireOwner } from "@/lib/session";
import { dateIn } from "@/lib/time";
import { getInvoice } from "@/modules/invoices/queries";
import { invoiceState } from "@/modules/invoices/state";
import { ownerTimezone } from "@/modules/settings/service";
import { newPaymentHref, paymentHref } from "../../payments/labels";
import { InvoiceStatusPill } from "../status-pill";
import { InvoiceActions } from "./invoice-actions";
import { InvoiceDetails } from "./invoice-details";

const parseId = async (params: PageProps<"/money/invoices/[id]">["params"]) =>
  z.uuid().safeParse((await params).id);

export async function generateMetadata({
  params,
}: PageProps<"/money/invoices/[id]">): Promise<Metadata> {
  const owner = await requireOwner();
  const id = await parseId(params);
  const invoice = id.success ? await getInvoice(owner.id, id.data) : null;
  return { title: invoice ? `Invoice ${invoice.number}` : "Invoice" };
}

export default async function InvoicePage({ params }: PageProps<"/money/invoices/[id]">) {
  const owner = await requireOwner();
  const id = await parseId(params);
  if (!id.success) notFound();
  const [invoice, timezone] = await Promise.all([
    getInvoice(owner.id, id.data),
    ownerTimezone(db, owner.id),
  ]);
  if (!invoice) notFound();
  const state = invoiceState(invoice, dateIn(timezone));
  const clientHref = invoice.organizationId
    ? companyHref(invoice.organizationId, "money")
    : contactHref(invoice.contactId!, "money");

  return (
    <div className="grid gap-6">
      <Link
        href="/money/invoices"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Invoices
      </Link>

      <header className="flex flex-wrap items-start gap-3">
        <div className="grid min-w-0 flex-1 gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight break-words">
              Invoice {invoice.number}
            </h1>
            <InvoiceStatusPill state={state} />
          </div>
          <Link
            href={clientHref}
            className="inline-flex w-fit items-center gap-2 font-medium underline-offset-4 hover:underline"
          >
            {invoice.organizationId ? (
              <CompanyLogo
                id={invoice.organizationId}
                name={invoice.clientName}
                logoVersion={invoice.logoVersion}
                className="size-6 text-[0.625rem]"
              />
            ) : (
              <ContactAvatar
                id={invoice.contactId!}
                name={invoice.clientName}
                photoVersion={invoice.photoVersion}
                className="size-6 text-[0.625rem]"
              />
            )}
            {invoice.clientName}
          </Link>
        </div>
        <InvoiceActions
          id={invoice.id}
          number={invoice.number}
          status={invoice.status}
          payments={invoice.allocations.length}
          editHref={`/money/invoices/${invoice.id}/edit`}
        />
      </header>

      <InvoiceDetails
        invoice={invoice}
        hrefs={{ newPayment: newPaymentHref({ invoice: invoice.id }), payment: paymentHref }}
      />
    </div>
  );
}
