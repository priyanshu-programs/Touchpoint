// Amounts are kept as whole minor units (paise, cents, fils) so sums never round.
// How many of them make one unit comes from the currency itself: 0 for JPY, 2 for
// INR, 3 for KWD.
export function currencyDigits(currency: string) {
  return new Intl.NumberFormat("en", { style: "currency", currency })
    .resolvedOptions().maximumFractionDigits ?? 2;
}

// Beyond this a bigint column still holds it, but a JavaScript number no longer does exactly.
const MAX_MINOR = Number.MAX_SAFE_INTEGER;

// An amount as the owner typed it ("1,50,000", "2500.50", "₹ 12,000") in minor units,
// or null when it is not one. Separators are commas, spaces and apostrophes in any
// grouping; the decimal point is a full stop.
export function toMinor(typed: string, currency: string): number | null {
  // A sign or code in front ("₹", "USD ") is dropped; a minus is not, so it is refused.
  const cleaned = typed
    .trim()
    .replace(/^[^\d.-]+/, "")
    .replace(/[,\s'’]/g, "");
  const match = /^(\d+)(?:\.(\d*))?$/.exec(cleaned);
  if (!match) return null;
  const digits = currencyDigits(currency);
  const fraction = match[2] ?? "";
  if (fraction.length > digits) return null;
  const minor = Number(`${match[1]}${fraction.padEnd(digits, "0")}`);
  return Number.isSafeInteger(minor) && minor <= MAX_MINOR ? minor : null;
}

// Rupees are grouped in lakhs and crores (₹1,50,000), every other currency in thousands.
export function formatMoney(minor: number, currency: string) {
  const digits = currencyDigits(currency);
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: minor % 10 ** digits === 0 ? 0 : digits,
    maximumFractionDigits: digits,
  }).format(minor / 10 ** digits);
}

// Short, for a chart's scale: ₹1.5L, ₹20K, US$1.2m.
export function formatMoneyCompact(minor: number, currency: string) {
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-GB", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(minor / 10 ** currencyDigits(currency));
}

// The amount back in the form it is typed in, for an edit form.
export function minorToInput(minor: number, currency: string) {
  const digits = currencyDigits(currency);
  const whole = Math.trunc(minor / 10 ** digits);
  const fraction = String(minor % 10 ** digits).padStart(digits, "0");
  return digits === 0 || /^0+$/.test(fraction) ? String(whole) : `${whole}.${fraction}`;
}

// A quantity of up to two decimals ("1", "1.5", "0.25") in hundredths, or null.
export function toHundredths(typed: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{0,2}))?$/.exec(typed.trim());
  if (!match) return null;
  const hundredths = Number(`${match[1]}${(match[2] ?? "").padEnd(2, "0")}`);
  return hundredths > 0 ? hundredths : null;
}

// A line's amount: the quantity times the unit amount, half a minor unit rounded up.
// Worked in bigint, since the product can pass what a number holds exactly.
export function lineAmount(hundredths: number, unitMinor: number): number | null {
  const amount = (BigInt(hundredths) * BigInt(unitMinor) + BigInt(50)) / BigInt(100);
  return amount <= BigInt(MAX_MINOR) ? Number(amount) : null;
}

// A rate to the base currency ("83.25", "0.0112") as the decimal text the column
// stores, or null. Up to ten whole digits and eight decimals, above 0.
export function toRate(typed: string): string | null {
  const match = /^(\d{1,10})(?:\.(\d{0,8}))?$/.exec(typed.trim().replace(/,/g, ""));
  if (!match) return null;
  const rate = `${match[1]}.${(match[2] ?? "").padEnd(8, "0")}`;
  return Number(rate) > 0 ? rate : null;
}

// A sum of minor units times their rates to the base currency, as the exact decimal
// text Postgres gives, in the base currency's minor units: scaled by the difference in
// the two currencies' decimals (a yen is 0, a rupee 2) and half a unit rounded up,
// once, in bigint.
export function convertToBase(product: string, currency: string, baseCurrency: string) {
  const [whole, fraction = ""] = product.split(".");
  const shift = currencyDigits(baseCurrency) - currencyDigits(currency);
  const scaled = BigInt(whole + fraction) * BigInt(10) ** BigInt(Math.max(shift, 0));
  const divisor = BigInt(10) ** BigInt(fraction.length + Math.max(-shift, 0));
  return Number((scaled * BigInt(2) + divisor) / (BigInt(2) * divisor));
}
