import Link from "next/link";
import { LinkedText } from "@/components/linked-text";
import { ButtonLink } from "@/components/button-link";
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
import { formatDate } from "@/lib/time";
import type { Invoice } from "@/modules/invoices/queries";
import { PAYMENT_METHOD_LABELS } from "@/modules/payments/schema";
import { InvoiceFile } from "./invoice-file";

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

// What an invoice says and what has been paid towards it, on its own page or in the
// panel of the record it bills. Where its payments open is the caller's.
export function InvoiceDetails({
  invoice,
  hrefs,
}: {
  invoice: Invoice;
  hrefs: { newPayment: string; payment: (id: string) => string };
}) {
  const money = (minor: number) => formatMoney(minor, invoice.currency);

  return (
    <>
    <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm sm:grid-cols-5">
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
      <div className="grid gap-1">
        <dt className="text-xs text-muted-foreground">Still owed</dt>
        <dd className="font-medium tabular-nums">
          {invoice.status === "issued" ? money(Math.max(invoice.balance, 0)) : "—"}
        </dd>
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
            {invoice.paid > 0 && (
              <>
                <FooterRow label="Paid" amount={`−${money(invoice.paid)}`} />
                <FooterRow label="Still owed" amount={money(invoice.balance)} strong />
              </>
            )}
          </TableFooter>
        </Table>
      </CardContent>
    </Card>

    {invoice.status === "issued" && (
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Payments</CardTitle>
          {invoice.balance > 0 && (
            <ButtonLink href={hrefs.newPayment} size="sm" scroll={false}>
              Record payment
            </ButtonLink>
          )}
        </CardHeader>
        <CardContent className="grid gap-3">
          {invoice.allocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payments yet. Record one when the money arrives.
            </p>
          ) : (
            <ul aria-label="Payments" className="grid gap-2 text-sm">
              {invoice.allocations.map((allocation) => (
                <li
                  key={allocation.paymentId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1"
                >
                  <Link
                    href={hrefs.payment(allocation.paymentId)}
                    scroll={false}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {formatDate(allocation.receivedOn)}
                  </Link>
                  <span className="text-muted-foreground">
                    {PAYMENT_METHOD_LABELS[allocation.method]}
                    {allocation.reference && ` · ${allocation.reference}`}
                  </span>
                  <span className="ml-auto font-medium tabular-nums">
                    {money(allocation.amountMinor)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {invoice.allocations.length > 0 && (
            <p className="text-xs text-muted-foreground">
              An invoice with payments is not edited or voided. To change it, delete its
              payments first.
            </p>
          )}
        </CardContent>
      </Card>
    )}

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
          <p className="max-w-prose break-words whitespace-pre-wrap">
            <LinkedText text={invoice.notes} />
          </p>
        </CardContent>
      </Card>
    )}
    </>
  );
}
