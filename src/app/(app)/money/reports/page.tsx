import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { dateIn } from "@/lib/time";
import { followUpCompliance, proposalAcceptance, replyRate } from "@/modules/reports/activity";
import { revenueByClient, revenueByMonth, revenueByService, timeToPayment } from "@/modules/reports/revenue";
import { reportParams } from "@/modules/reports/schema";
import { chosenRange, PERIOD_LABELS, PERIODS } from "@/modules/revenue/period";
import type { BaseSum } from "@/modules/revenue/queries";
import { getSettings } from "@/modules/settings/service";
import { clientParams } from "../figure-links";
import { MoneyHeader } from "../money-header";
import { OverviewControls } from "../overview-controls";
import { paymentsHref } from "../payments/labels";
import { rangeText } from "../range";
import { BarChart } from "./bar-chart";
import { periodKeep, reportsHref } from "./links";
import { counted, NotEnoughData, serviceName } from "./parts";

export const metadata: Metadata = { title: "Reports" };

const TOP_CLIENTS = 10;

const monthName = (month: string, style: "long" | "short") =>
  new Intl.DateTimeFormat("en-GB", {
    month: style,
    year: style === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

// The scale's top: the largest month rounded up to 1, 2, 2.5 or 5 of its power of ten.
function scaleTop(largest: number) {
  const power = 10 ** Math.floor(Math.log10(largest));
  return [1, 2, 2.5, 5, 10].map((step) => step * power).find((top) => top >= largest)!;
}

function ReportCard({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
    </Card>
  );
}

function Headline({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="w-fit text-2xl font-semibold tracking-tight tabular-nums underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

// A share of something counted, with what it was counted out of.
function Rate({
  rate,
  href,
  label,
  children,
}: {
  rate: number;
  href: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <Headline href={href}>
        {percent(rate)} <span className="text-base font-normal text-muted-foreground">{label}</span>
      </Headline>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

// What a sum in the base currency took in from other currencies, and left out.
function Conversions({ sum, base, href }: { sum: BaseSum; base: string; href: (currency: string) => string }) {
  return (
    <>
      {sum.converted.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Includes {sum.converted.map(({ currency, minor }) => formatMoney(minor, currency)).join(", ")} at
          your recorded rates.
        </p>
      )}
      {sum.unconverted.map((amount) => (
        <p key={amount.currency} className="text-sm">
          <Link href={href(amount.currency)} className="underline">
            {formatMoney(amount.minor, amount.currency)}
          </Link>{" "}
          is left out: {amount.count === 1 ? "it has" : "they have"} no rate to {base}.
        </p>
      ))}
    </>
  );
}

export default async function ReportsPage({ searchParams }: PageProps<"/money/reports">) {
  const owner = await requireOwner();
  const params = reportParams.parse(await searchParams);
  const settings = await getSettings(owner.id);
  const base = settings?.baseCurrency ?? "INR";
  const timezone = settings?.timezone ?? "UTC";
  const today = dateIn(timezone);
  const { period, range } = chosenRange(params, today);
  const keep = periodKeep(period, range);
  const money = { baseCurrency: base };
  const zoned = { today, timezone };
  const [byMonth, byClient, byService, paidIn, followUps, replies, proposals] = await Promise.all([
    revenueByMonth(owner.id, range, { today, ...money }),
    revenueByClient(owner.id, range, { ...money, limit: TOP_CLIENTS }),
    revenueByService(owner.id, range, money),
    timeToPayment(owner.id, range, today),
    followUpCompliance(owner.id, range, zoned),
    replyRate(owner.id, range, zoned),
    proposalAcceptance(owner.id, range, zoned),
  ]);
  const received = byMonth.total;
  const dates = rangeText(range);
  const when = dates ?? "at any time";
  const paid = (currency?: string) => paymentsHref({ ...range, currency });

  const largest = Math.max(0, ...byMonth.months.map((month) => month.minor));
  const top = largest > 0 ? scaleTop(largest) : 0;
  const yearly = new Set(byMonth.months.map((month) => month.month.slice(0, 4))).size > 1;
  // At most about a dozen names fit under the bars.
  const every = Math.ceil(byMonth.months.length / 12);
  const servicesSum = byService.services.reduce((sum, row) => sum + row.minor, byService.unallocated.minor);

  return (
    <div className="grid gap-6">
      <MoneyHeader
        title="Reports"
        subtitle="When the money came in, who it came from and what it paid for, and how your follow-ups and proposals went."
      />

      <OverviewControls
        path="/money/reports"
        periods={PERIODS.map((value) => ({
          value,
          label: PERIOD_LABELS[value],
          href: reportsHref({ period: value }),
        }))}
        current={period ?? ""}
        label={period ? PERIOD_LABELS[period] : "Your dates"}
        range={range}
      />

      <p className="text-sm text-muted-foreground">
        Money received {when}, in {base}. Other currencies count at the rate recorded with each payment.
      </p>

      <div className="grid items-start gap-4 md:grid-cols-2">
        <ReportCard title="Revenue by month" className="md:col-span-2">
          {received.count === 0 ? (
            <NotEnoughData>No payments were received {when}.</NotEnoughData>
          ) : (
            <>
              <div className="grid gap-1">
                <Headline href={paid()}>{formatMoney(received.minor, base)}</Headline>
                <p className="text-sm text-muted-foreground">
                  Received in {counted(received.count, "payment")}.
                </p>
                <Conversions sum={received} base={base} href={paid} />
              </div>
              {top > 0 && (
                <BarChart
                  max={top}
                  ticks={[0, top / 2, top].map((value) => ({
                    value,
                    label: formatMoneyCompact(value, base),
                  }))}
                  bars={byMonth.months.map((month, index) => ({
                    key: month.month,
                    axisLabel:
                      index % every !== 0
                        ? ""
                        : monthName(month.month, "short") +
                          (yearly && (index === 0 || month.month.endsWith("-01"))
                            ? ` ${month.month.slice(2, 4)}`
                            : ""),
                    label: monthName(month.month, "long"),
                    value: month.minor,
                    text: formatMoney(month.minor, base),
                    detail: counted(month.count, "payment"),
                    href: paymentsHref({ from: month.from, to: month.to }),
                  }))}
                />
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Payments</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byMonth.months.map((month) => (
                    <TableRow key={month.month}>
                      <TableCell>
                        <Link
                          href={paymentsHref({ from: month.from, to: month.to })}
                          className="underline-offset-4 hover:underline"
                        >
                          {monthName(month.month, "long")}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{month.count}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(month.minor, base)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </ReportCard>

        <ReportCard title="Revenue by client">
          {byClient.total === 0 ? (
            <NotEnoughData>No client paid you {when}.</NotEnoughData>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {formatMoney(received.minor, base)} from {counted(byClient.total, "client")}, most first.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byClient.rows.map((row) => (
                    <TableRow key={row.name + Object.values(row.client)[0]}>
                      <TableCell className="max-w-48 truncate">
                        <Link
                          href={paymentsHref({ ...range, ...clientParams(row.client) })}
                          className="underline-offset-4 hover:underline"
                        >
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(row.minor, base)}
                        {row.unconverted.length > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            and{" "}
                            {row.unconverted.map(({ currency, minor }) => formatMoney(minor, currency)).join(", ")}{" "}
                            with no rate
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {byClient.total > TOP_CLIENTS && (
                <Link href={reportsHref(keep, "clients")} className="w-fit text-sm underline">
                  All {byClient.total} clients
                </Link>
              )}
            </>
          )}
        </ReportCard>

        <ReportCard title="Revenue by service">
          {received.count === 0 ? (
            <NotEnoughData>No payments were received {when}.</NotEnoughData>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {formatMoney(received.minor, base)} received, split between the services on the invoices it paid
                by their amounts.
              </p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Service</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byService.services.map((row) => (
                    <TableRow key={row.service ?? ""}>
                      <TableCell className="max-w-48 truncate">
                        <Link
                          href={reportsHref(
                            keep,
                            "services",
                            row.service === null ? { unnamed: "1" } : { service: row.service },
                          )}
                          className="underline-offset-4 hover:underline"
                        >
                          {serviceName(row.service)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(row.minor, base)}</TableCell>
                    </TableRow>
                  ))}
                  {byService.unallocated.count > 0 && (
                    <TableRow>
                      <TableCell className="whitespace-normal">
                        <Link
                          href={reportsHref(keep, "unallocated")}
                          className="underline-offset-4 hover:underline"
                        >
                          Not put towards an invoice yet
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(byService.unallocated.minor, base)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              {servicesSum !== received.minor && (
                <p className="text-xs text-muted-foreground">
                  Each service is rounded on its own, so these add up to {formatMoney(servicesSum, base)}.
                </p>
              )}
            </>
          )}
        </ReportCard>

        <ReportCard title="Time to payment">
          {paidIn.days === null ? (
            <NotEnoughData>No invoice was paid in full {when}.</NotEnoughData>
          ) : (
            <div className="grid gap-1">
              <Headline href={reportsHref(keep, "time-to-payment")}>
                {counted(paidIn.days, "day")}
              </Headline>
              <p className="text-sm text-muted-foreground">
                On average from issue to paid in full, across {counted(paidIn.count, "invoice")} paid in full {when}.
              </p>
            </div>
          )}
        </ReportCard>
      </div>

      <h2 className="text-lg font-semibold tracking-tight">Follow-ups and sales</h2>

      <div className="grid items-start gap-4 md:grid-cols-3">
        <ReportCard title="Follow-up compliance">
          {followUps.rate === null ? (
            <NotEnoughData>No follow-up was due {when}.</NotEnoughData>
          ) : (
            <Rate rate={followUps.rate} href={reportsHref(keep, "follow-ups")} label="on time">
              {followUps.onTime} of {counted(followUps.count, "follow-up")} due {when} done by the due date.
            </Rate>
          )}
        </ReportCard>

        <ReportCard title="Reply rate">
          {replies.rate === null ? (
            <NotEnoughData>You reached out to nobody {when}.</NotEnoughData>
          ) : (
            <Rate rate={replies.rate} href={reportsHref(keep, "replies")} label="replied">
              {replies.replied} of {replies.count === 1 ? "1 person" : `${replies.count} people`} you reached out
              to {when} wrote back afterwards.
            </Rate>
          )}
        </ReportCard>

        <ReportCard title="Proposal acceptance">
          {proposals.rate === null ? (
            <NotEnoughData>
              No proposal sent {when} has been accepted or rejected
              {proposals.waiting > 0 && `; ${proposals.waiting} waiting for an answer`}.
            </NotEnoughData>
          ) : (
            <Rate rate={proposals.rate} href={reportsHref(keep, "proposals")} label="accepted">
              {proposals.accepted} of {counted(proposals.answered, "proposal")} sent {when} and answered.
              {proposals.waiting > 0 && ` ${proposals.waiting} waiting for an answer.`}
              {proposals.superseded > 0 && ` ${proposals.superseded} replaced by a newer version.`}
            </Rate>
          )}
        </ReportCard>
      </div>
    </div>
  );
}
