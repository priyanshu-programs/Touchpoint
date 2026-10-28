import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ClickableRow } from "@/components/clickable-row";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { dateIn, formatDate, formatDateTime } from "@/lib/time";
import { SEND_STATUS_LABELS } from "@/modules/materials/schema";
import {
  followUpCompliance,
  followUpRows,
  proposalAcceptance,
  proposalRows,
  replyRate,
  replyRows,
} from "@/modules/reports/activity";
import {
  revenueByClient,
  serviceRows,
  timeToPayment,
  timeToPaymentRows,
  unallocatedRows,
} from "@/modules/reports/revenue";
import { REPORT_DETAILS, reportParams, type ReportDetail } from "@/modules/reports/schema";
import { chosenRange, PERIOD_LABELS, PERIODS } from "@/modules/revenue/period";
import { getSettings } from "@/modules/settings/service";
import { ListCard, ListFooter } from "../../../people/(lists)/list-card";
import { contactHref, labelFor } from "../../../people/labels";
import { clientParams } from "../../figure-links";
import { OverviewControls } from "../../overview-controls";
import { paymentHref, paymentsHref } from "../../payments/labels";
import { rangeText } from "../../range";
import { periodKeep, reportsHref } from "../links";
import { counted, NotEnoughData, serviceName } from "../parts";

const PAGE_SIZE = 50;

const TITLES: Record<ReportDetail, string> = {
  clients: "Revenue by client",
  services: "Revenue by service",
  unallocated: "Not put towards an invoice yet",
  "time-to-payment": "Time to payment",
  "follow-ups": "Follow-up compliance",
  replies: "Reply rate",
  proposals: "Proposal acceptance",
};

export async function generateMetadata({ params }: PageProps<"/money/reports/[report]">): Promise<Metadata> {
  const { report } = await params;
  const detail = REPORT_DETAILS.find((name) => name === report);
  return { title: detail ? TITLES[detail] : "Reports" };
}

const invoiceHref = (id: string) => `/money/invoices/${id}`;

export default async function ReportRowsPage({ params, searchParams }: PageProps<"/money/reports/[report]">) {
  const owner = await requireOwner();
  const { report: named } = await params;
  const report = REPORT_DETAILS.find((name) => name === named);
  if (!report) notFound();
  const query = reportParams.parse(await searchParams);
  // A service's rows need the service; the lines naming none are asked for apart.
  const service = query.unnamed ? null : query.service;
  if (report === "services" && service === undefined) notFound();

  const settings = await getSettings(owner.id);
  const base = settings?.baseCurrency ?? "INR";
  const timezone = settings?.timezone ?? "UTC";
  const today = dateIn(timezone);
  const zoned = { today, timezone };
  const { period, range } = chosenRange(query, today);
  const keep = periodKeep(period, range);
  const which = report === "services" ? (service === null ? { unnamed: "1" as const } : { service }) : {};
  const pageNumber = query.page ?? 1;
  const paging = { limit: PAGE_SIZE, offset: (pageNumber - 1) * PAGE_SIZE };
  const when = rangeText(range) ?? "at any time";

  let summary: ReactNode;
  let table: ReactNode = null;
  let total = 0;
  let shown = 0;

  if (report === "clients") {
    const page = await revenueByClient(owner.id, range, { baseCurrency: base, ...paging });
    ({ total } = page);
    shown = page.rows.length;
    summary = `${counted(total, "client")} paid you ${when}, most first.`;
    table = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead className="text-right">Payments</TableHead>
            <TableHead className="text-right">Received</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.rows.map((row) => {
            const href = paymentsHref({ ...range, ...clientParams(row.client) });
            return (
              <ClickableRow key={Object.values(row.client)[0]} href={href}>
                <TableCell className="max-w-64 truncate">
                  <Link href={href} className="font-medium underline-offset-4 hover:underline">
                    {row.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.minor, base)}
                  {row.unconverted.length > 0 && (
                    <span className="block text-xs text-muted-foreground">
                      and {row.unconverted.map(({ currency, minor }) => formatMoney(minor, currency)).join(", ")}{" "}
                      with no rate
                    </span>
                  )}
                </TableCell>
              </ClickableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  } else if (report === "services") {
    const page = await serviceRows(owner.id, range, service!, paging);
    ({ total } = page);
    shown = page.rows.length;
    summary = (
      <>
        What <span className="font-medium text-foreground">{serviceName(service!)}</span> was paid {when}: each
        payment&apos;s share of an invoice, by the amounts of its lines.
      </>
    );
    table = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Received</TableHead>
            <TableHead>Invoice</TableHead>
            <TableHead className="hidden sm:table-cell">Client</TableHead>
            <TableHead className="text-right">Share</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.rows.map((row) => (
            <TableRow key={`${row.paymentId}-${row.invoiceId}`}>
              <TableCell>
                <Link href={paymentHref(row.paymentId)} className="underline-offset-4 hover:underline">
                  {formatDate(row.receivedOn)}
                </Link>
              </TableCell>
              <TableCell className="max-w-40 truncate">
                <Link href={invoiceHref(row.invoiceId)} className="font-medium underline-offset-4 hover:underline">
                  {row.invoiceNumber}
                </Link>
              </TableCell>
              <TableCell className="hidden max-w-48 truncate sm:table-cell">{row.clientName}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(row.minor, row.currency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  } else if (report === "unallocated") {
    const page = await unallocatedRows(owner.id, range, paging);
    ({ total } = page);
    shown = page.rows.length;
    summary = `Payments received ${when} with money not yet put towards an invoice. Open one to put it towards an invoice.`;
    table = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Received</TableHead>
            <TableHead className="hidden sm:table-cell">Client</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Payment</TableHead>
            <TableHead className="text-right">Not put towards</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.rows.map((row) => {
            const href = paymentHref(row.id);
            return (
              <ClickableRow key={row.id} href={href}>
                <TableCell>
                  <div className="grid gap-1">
                    <Link href={href} className="font-medium underline-offset-4 hover:underline">
                      {formatDate(row.receivedOn)}
                    </Link>
                    <span className="text-xs text-muted-foreground sm:hidden">{row.clientName}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden max-w-48 truncate sm:table-cell">{row.clientName}</TableCell>
                <TableCell className="hidden text-right tabular-nums sm:table-cell">
                  {formatMoney(row.amountMinor, row.currency)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatMoney(row.leftover, row.currency)}</TableCell>
              </ClickableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  } else if (report === "time-to-payment") {
    const [page, mean] = await Promise.all([
      timeToPaymentRows(owner.id, range, today, paging),
      timeToPayment(owner.id, range, today),
    ]);
    ({ total } = page);
    shown = page.rows.length;
    summary =
      mean.days === null
        ? null
        : `${counted(mean.days, "day")} on average from issue to paid in full, across ${counted(mean.count, "invoice")} paid in full ${when}.`;
    table = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead className="hidden sm:table-cell">Client</TableHead>
            <TableHead className="hidden md:table-cell">Issued</TableHead>
            <TableHead className="hidden sm:table-cell">Paid in full</TableHead>
            <TableHead className="text-right">Days</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.rows.map((row) => {
            const href = invoiceHref(row.id);
            return (
              <ClickableRow key={row.id} href={href}>
                <TableCell className="max-w-40">
                  <div className="grid gap-1">
                    <Link href={href} className="truncate font-medium underline-offset-4 hover:underline">
                      {row.number}
                    </Link>
                    <span className="truncate text-xs text-muted-foreground sm:hidden">{row.clientName}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden max-w-48 truncate sm:table-cell">{row.clientName}</TableCell>
                <TableCell className="hidden md:table-cell">{formatDate(row.issueDate)}</TableCell>
                <TableCell className="hidden sm:table-cell">{formatDate(row.paidOn)}</TableCell>
                <TableCell className="text-right tabular-nums">{row.days}</TableCell>
              </ClickableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  } else if (report === "follow-ups") {
    const [page, rate] = await Promise.all([
      followUpRows(owner.id, range, { ...zoned, ...paging }),
      followUpCompliance(owner.id, range, zoned),
    ]);
    ({ total } = page);
    shown = page.rows.length;
    summary = `${rate.onTime} of ${counted(rate.count, "follow-up")} due ${when} done by the due date. One due today counts once it is done.`;
    table = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Follow-up</TableHead>
            <TableHead className="hidden sm:table-cell">With</TableHead>
            <TableHead className="hidden sm:table-cell">Due</TableHead>
            <TableHead className="text-right">Done</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.rows.map((row) => {
            const href = `/tasks/${row.id}`;
            const outcome =
              row.outcome.done === "on-time"
                ? "On time"
                : row.outcome.done === "late"
                  ? `${counted(row.outcome.days, "day")} late`
                  : "Not done";
            const who = [row.contactName, row.organizationName].filter(Boolean).join(", ");
            return (
              <ClickableRow key={row.id} href={href}>
                <TableCell className="max-w-56">
                  <div className="grid gap-1">
                    <Link href={href} className="truncate font-medium underline-offset-4 hover:underline">
                      {row.title}
                    </Link>
                    <span className="truncate text-xs text-muted-foreground sm:hidden">
                      Due {formatDate(row.dueOn)}
                      {who && ` · ${who}`}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden max-w-48 truncate sm:table-cell">{who || "—"}</TableCell>
                <TableCell className="hidden sm:table-cell">{formatDate(row.dueOn)}</TableCell>
                <TableCell className={row.outcome.done ? "text-right" : "text-right text-destructive"}>
                  {outcome}
                </TableCell>
              </ClickableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  } else if (report === "replies") {
    const [page, rate] = await Promise.all([
      replyRows(owner.id, range, { ...zoned, ...paging }),
      replyRate(owner.id, range, zoned),
    ]);
    ({ total } = page);
    shown = page.rows.length;
    summary = `${rate.replied} of ${rate.count === 1 ? "1 person" : `${rate.count} people`} you reached out to ${when} wrote back afterwards. Only activities logged as outbound and inbound count.`;
    table = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Person</TableHead>
            <TableHead className="hidden sm:table-cell">Reached out</TableHead>
            <TableHead className="text-right">Reply</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.rows.map((row) => {
            const href = contactHref(row.contactId, "activity");
            return (
              <ClickableRow key={row.contactId} href={href}>
                <TableCell className="max-w-56">
                  <div className="grid gap-1">
                    <Link href={href} className="truncate font-medium underline-offset-4 hover:underline">
                      {row.name}
                    </Link>
                    {row.company && <span className="truncate text-xs text-muted-foreground">{row.company}</span>}
                  </div>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  {labelFor(row.outKind)}, {formatDateTime(row.outAt, timezone)}
                </TableCell>
                <TableCell className="text-right">
                  {row.replyAt ? (
                    <>
                      {labelFor(row.replyKind!)}, {formatDateTime(row.replyAt, timezone)}
                    </>
                  ) : (
                    <span className="text-muted-foreground">No reply yet</span>
                  )}
                </TableCell>
              </ClickableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  } else {
    const [page, rate] = await Promise.all([
      proposalRows(owner.id, range, { ...zoned, ...paging }),
      proposalAcceptance(owner.id, range, zoned),
    ]);
    ({ total } = page);
    shown = page.rows.length;
    const aside = [
      rate.waiting > 0 && `${rate.waiting} waiting for an answer`,
      rate.superseded > 0 && `${rate.superseded} replaced by a newer version`,
    ]
      .filter(Boolean)
      .join(" and ");
    summary = `${rate.accepted} of ${counted(rate.answered, "proposal")} sent ${when} and answered were accepted.${aside ? ` Listed but not counted: ${aside}.` : ""}`;
    table = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Proposal</TableHead>
            <TableHead className="hidden sm:table-cell">To</TableHead>
            <TableHead className="hidden md:table-cell">Sent</TableHead>
            <TableHead className="text-right">Answer</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {page.rows.map((row) => {
            const href = `/materials/${row.materialId}`;
            const to = [row.people, row.organizationName].filter(Boolean).join(", ");
            return (
              <ClickableRow key={row.id} href={href}>
                <TableCell className="max-w-56">
                  <div className="grid gap-1">
                    <Link href={href} className="truncate font-medium underline-offset-4 hover:underline">
                      {row.material}
                    </Link>
                    <span className="truncate text-xs text-muted-foreground">{row.version}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden max-w-48 truncate sm:table-cell">{to || "—"}</TableCell>
                <TableCell className="hidden md:table-cell">{formatDateTime(row.sentAt, timezone)}</TableCell>
                <TableCell className="text-right">{SEND_STATUS_LABELS[row.status]}</TableCell>
              </ClickableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  }

  const here = (change: { page?: number } = {}) => reportsHref(keep, report, { ...which, ...change });

  return (
    <div className="grid gap-6">
      <Link
        href={reportsHref(keep)}
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Reports
      </Link>

      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          {TITLES[report]}
          {report === "services" && `: ${serviceName(service!)}`}
        </h1>
        {total > 0 && summary && <p className="text-muted-foreground">{summary}</p>}
      </div>

      <OverviewControls
        path={`/money/reports/${report}`}
        periods={PERIODS.map((value) => ({
          value,
          label: PERIOD_LABELS[value],
          href: reportsHref({ period: value }, report, which),
        }))}
        current={period ?? ""}
        label={period ? PERIOD_LABELS[period] : "Your dates"}
        range={range}
        hidden={which}
      />

      {total === 0 ? (
        <NotEnoughData>Nothing counts towards this report {when}.</NotEnoughData>
      ) : (
        <>
          <ListCard>{table}</ListCard>
          <ListFooter first={(pageNumber - 1) * PAGE_SIZE + 1} shown={shown} total={total}>
            {(pageNumber > 1 || pageNumber * PAGE_SIZE < total) && (
              <nav aria-label="Pages" className="flex gap-4">
                {pageNumber > 1 && (
                  <Link href={here({ page: pageNumber === 2 ? undefined : pageNumber - 1 })} className="underline">
                    Previous page
                  </Link>
                )}
                {pageNumber * PAGE_SIZE < total && (
                  <Link href={here({ page: pageNumber + 1 })} className="underline">
                    Next page
                  </Link>
                )}
              </nav>
            )}
          </ListFooter>
        </>
      )}
    </div>
  );
}
