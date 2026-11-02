import Link from "next/link";
import type { ReactNode } from "react";
import { formatMoney } from "@/lib/money";
import type { BaseSum } from "@/modules/revenue/queries";

export const counted = (count: number, one: string) => (count === 1 ? `1 ${one}` : `${count} ${one}s`);

export const serviceName = (service: string | null) => service ?? "No service named";

// What a report says in place of a figure when nothing counts towards it, so an empty
// period never reads as zero.
export function NotEnoughData({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">Not enough data.</span> {children}
    </p>
  );
}

export const monthName = (month: string, style: "long" | "short") =>
  new Intl.DateTimeFormat("en-GB", {
    month: style,
    year: style === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));

// The scale's top: the largest month rounded up to 1, 2, 2.5 or 5 of its power of ten.
export function scaleTop(largest: number) {
  const power = 10 ** Math.floor(Math.log10(largest));
  return [1, 2, 2.5, 5, 10].map((step) => step * power).find((top) => top >= largest)!;
}

// What a sum in the base currency took in from other currencies, and left out.
export function Conversions({
  sum,
  base,
  href,
}: {
  sum: BaseSum;
  base: string;
  href: (currency: string) => string;
}) {
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
