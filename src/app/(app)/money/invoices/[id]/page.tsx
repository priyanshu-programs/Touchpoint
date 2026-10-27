import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { companyHref, contactHref } from "@/app/(app)/people/labels";
import { CompanyLogo, ContactAvatar } from "@/components/company-logo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { formatDate } from "@/lib/time";
import { getInvoice } from "@/modules/invoices/queries";
import { InvoiceStatusPill } from "../status-pill";
import { InvoiceActions } from "./invoice-actions";
import { InvoiceFile } from "./invoice-file";

const parseId = async (params: PageProps<"/money/invoices/[id]">["params"]) =>
  z.uuid().safeParse((await params).id);

const sizeOf = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

// A quantity is stored with two decimals and shown without the ones it does not need.
const quantityOf = (quantity: string) => String(Number(quantity));

// A total under the lines, its label under Description and its amount under Amount,
// with the columns a phone leaves out left out here too.
function FooterRow({ label, amount, strong }: { label: string; amount: string; strong?: boolean }) {
  return (
    <TableRow className={strong ? "font-semibold" : undefined}>
      <TableCell className="whitespace-normal break-words">{label}</TableCell>
      <TableCell className="hidden sm:table-cell" />
      <TableCell />
      <TableCell className="hidden sm:table-cell" />
      <TableCell className="text-right tabular-nums">{amount}</TableCell>
    </TableRow>
  );
}

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
  const invoice = await getInvoice(owner.id, id.data);
  if (!invoice) notFound();
  const money = (minor: number) => formatMoney(minor, invoice.currency);
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
            <InvoiceStatusPill status={invoice.status} />
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
          editHref={`/money/invoices/${invoice.id}/edit`}
        />
      </header>

      <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm sm:grid-cols-4">
        <div className="grid gap-1">
          <dt className="text-xs text-muted-foreground">Issued on</dt>
          <dd className="font-medium">{formatDate(invoice.issueDate)}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-xs text-muted-foreground">Due on</dt>
          <dd className="font-medium">{formatDate(invoice.dueDate)}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-xs text-muted-foreground">Currency</dt>
          <dd className="font-medium">{invoice.currency}</dd>
        </div>
        <div className="grid gap-1">
          <dt className="text-xs text-muted-foreground">Total</dt>
          <dd className="font-medium tabular-nums">{money(invoice.total)}</dd>
        </div>
      </dl>

      <Card>
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="hidden sm:table-cell">Service</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Price</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.lines.map((line, index) => (
                <TableRow key={index}>
                  <TableCell className="whitespace-normal break-words">
                    {line.description}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {line.serviceCategory ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {quantityOf(line.quantity)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {money(line.unitAmountMinor)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {money(line.amountMinor)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              {invoice.adjustments.length > 0 && (
                <>
                  <FooterRow label="Lines" amount={money(invoice.subtotal)} />
                  {invoice.adjustments.map((adjustment, index) => (
                    <FooterRow
                      key={index}
                      label={adjustment.reason}
                      amount={`−${money(adjustment.amountMinor)}`}
                    />
                  ))}
                </>
              )}
              <FooterRow label="Total" amount={money(invoice.total)} strong />
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoice file</CardTitle>
        </CardHeader>
        <CardContent>
          <InvoiceFile
            id={invoice.id}
            file={
              invoice.fileName && invoice.fileSize !== null
                ? { name: invoice.fileName, size: sizeOf(invoice.fileSize) }
                : null
            }
          />
        </CardContent>
      </Card>

      {invoice.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="max-w-prose break-words whitespace-pre-wrap">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
