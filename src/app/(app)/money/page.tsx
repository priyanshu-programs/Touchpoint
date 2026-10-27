import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/money";
import { requireOwner } from "@/lib/session";
import { dateIn } from "@/lib/time";
import { chosenRange, PERIOD_LABELS, PERIODS, revenueParams } from "@/modules/revenue/period";
import { revenueSummary, type CurrencyAmount } from "@/modules/revenue/queries";
import { getSettings } from "@/modules/settings/service";
import { namedClient } from "./client";
import { clientParams, figureLinks } from "./figure-links";
import { MoneyHeader } from "./money-header";
import { OverviewControls } from "./overview-controls";
import { rangeText } from "./range";

export const metadata: Metadata = { title: "Money" };

const counted = (count: number, one: string) => (count === 1 ? `1 ${one}` : `${count} ${one}s`);

const listed = (amounts: CurrencyAmount[]) =>
  amounts.map(({ currency, minor }) => formatMoney(minor, currency)).join(", ");

function Figure({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="text-2xl font-semibold tracking-tight tabular-nums underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}

export default async function MoneyPage({ searchParams }: PageProps<"/money">) {
  const owner = await requireOwner();
  const params = revenueParams.parse(await searchParams);
  const settings = await getSettings(owner.id);
  const base = settings?.baseCurrency ?? "INR";
  const today = dateIn(settings?.timezone ?? "UTC");
  const { period, range } = chosenRange(params, today);
  const client = await namedClient(owner.id, params);
  const summary = await revenueSummary(owner.id, {
    range,
    client: client ?? undefined,
    today,
    baseCurrency: base,
  });
  const links = figureLinks(range, client ?? undefined);
  const { received, invoiced, outstanding } = summary;
  const periodHref = (value: string) => {
    const search = new URLSearchParams({ period: value });
    for (const [name, id] of Object.entries(clientParams(client ?? undefined))) {
      if (id) search.set(name, id);
    }
    return `/money?${search.toString()}`;
  };
  const dates = rangeText(range);

  return (
    <div className="grid gap-6">
      <MoneyHeader
        title="Money"
        subtitle="What came in, what you billed and what is still owed."
      />

      <OverviewControls
        path="/money"
        periods={PERIODS.map((value) => ({
          value,
          label: PERIOD_LABELS[value],
          href: periodHref(value),
        }))}
        current={period ?? ""}
        label={period ? PERIOD_LABELS[period] : "Your dates"}
        range={range}
        client={{
          initial: client
            ? {
                id:
                  "organizationId" in client
                    ? `organization:${client.organizationId}`
                    : `contact:${client.contactId}`,
                label: client.name,
              }
            : null,
          keep: period ? { period } : { from: range.from, to: range.to },
        }}
      />

      <p className="text-sm text-muted-foreground">
        {dates ? `Received and invoiced ${dates}` : "Received and invoiced at any time"}
        {client ? `, for ${client.name}` : ", for every client"}. Outstanding is what is
        owed today.
      </p>

      <div className="grid items-start gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Received</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1">
            <Figure href={links.received()}>{formatMoney(received.minor, base)}</Figure>
            <p className="text-sm text-muted-foreground">{counted(received.count, "payment")}</p>
            {received.converted.length > 0 && (
              <p className="text-sm text-muted-foreground">
                Includes {listed(received.converted)} at your recorded rates.
              </p>
            )}
            {received.unconverted.map((amount) => (
              <p key={amount.currency} className="text-sm">
                <Link href={links.received(amount.currency)} className="underline">
                  {formatMoney(amount.minor, amount.currency)}
                </Link>{" "}
                is left out: {amount.count === 1 ? "it has" : "they have"} no rate to {base}.
              </p>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoiced</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {invoiced.length === 0 ? (
              <div className="grid gap-1">
                <Figure href={links.invoiced(base)}>{formatMoney(0, base)}</Figure>
                <p className="text-sm text-muted-foreground">No invoices issued</p>
              </div>
            ) : (
              invoiced.map((amount) => (
                <div key={amount.currency} className="grid gap-1">
                  <Figure href={links.invoiced(amount.currency)}>
                    {formatMoney(amount.minor, amount.currency)}
                  </Figure>
                  <p className="text-sm text-muted-foreground">{counted(amount.count, "invoice")}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Outstanding today</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {outstanding.length === 0 ? (
              <div className="grid gap-1">
                <Figure href={links.outstanding(base)}>{formatMoney(0, base)}</Figure>
                <p className="text-sm text-muted-foreground">Nothing is owed</p>
              </div>
            ) : (
              outstanding.map((amount) => (
                <div key={amount.currency} className="grid gap-1">
                  <Figure href={links.outstanding(amount.currency)}>
                    {formatMoney(amount.minor, amount.currency)}
                  </Figure>
                  <p className="text-sm text-muted-foreground">{counted(amount.count, "invoice")}</p>
                  {amount.overdueCount > 0 && (
                    <Link
                      href={links.overdue(amount.currency)}
                      className="text-sm font-medium text-destructive underline-offset-4 hover:underline"
                    >
                      {formatMoney(amount.overdueMinor, amount.currency)} overdue (
                      {counted(amount.overdueCount, "invoice")})
                    </Link>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
