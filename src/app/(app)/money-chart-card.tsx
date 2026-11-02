import Link from "next/link";
import { ButtonLink } from "@/components/button-link";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { revenueLastTwelveMonths } from "@/modules/reports/revenue";
import { BarChart } from "./money/reports/bar-chart";
import { Conversions, counted, monthName, NotEnoughData, scaleTop } from "./money/reports/parts";
import { paymentsHref } from "./money/payments/labels";

// Money received over the last twelve months, with this month the bright one. The chart
// answers only the pointer, so a hidden table holds the same figures and links; the Reports
// button is the way there by keyboard.
export async function MoneyChartCard({
  ownerId,
  today,
  base,
}: {
  ownerId: string;
  today: string;
  base: string;
}) {
  const { total, months } = await revenueLastTwelveMonths(ownerId, { today, baseCurrency: base });
  const first = months[0];
  const last = months.at(-1)!;
  const paid = (currency?: string) => paymentsHref({ from: first.from, to: last.to, currency });
  const largest = Math.max(0, ...months.map((month) => month.minor));
  const top = largest > 0 ? scaleTop(largest) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Money received</CardTitle>
        <CardAction>
          <ButtonLink href="/money/reports" variant="outline" size="sm">
            Reports
          </ButtonLink>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-3">
        {total.count === 0 ? (
          <NotEnoughData>No payments were received in the last 12 months.</NotEnoughData>
        ) : (
          <>
            <div className="grid gap-1">
              <p className="text-3xl font-semibold tracking-tight tabular-nums [overflow-wrap:anywhere]">
                {formatMoney(total.minor, base)}
              </p>
              <p className="text-sm text-muted-foreground">
                In the last 12 months, from {counted(total.count, "payment")}.
              </p>
              <Conversions sum={total} base={base} href={paid} />
            </div>
            {top > 0 && (
              <BarChart
                max={top}
                highlight={last.month}
                ticks={[0, top / 2, top].map((value) => ({
                  value,
                  label: formatMoneyCompact(value, base),
                }))}
                bars={months.map((month, index) => ({
                  key: month.month,
                  // Every other month, ending on this one, so the names fit on a phone.
                  axisLabel: index % 2 === 1 ? monthName(month.month, "short") : "",
                  label: monthName(month.month, "long"),
                  value: month.minor,
                  text: formatMoney(month.minor, base),
                  detail: counted(month.count, "payment"),
                  href: paymentsHref({ from: month.from, to: month.to }),
                }))}
              />
            )}
            <table className="sr-only">
              <caption>Money received in each of the last 12 months</caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Payments</th>
                  <th scope="col">Received</th>
                </tr>
              </thead>
              <tbody>
                {months.map((month) => (
                  <tr key={month.month}>
                    <td>
                      <Link href={paymentsHref({ from: month.from, to: month.to })} tabIndex={-1}>
                        {monthName(month.month, "long")}
                      </Link>
                    </td>
                    <td>{month.count}</td>
                    <td>{formatMoney(month.minor, base)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
