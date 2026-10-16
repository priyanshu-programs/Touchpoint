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

// The amount back in the form it is typed in, for an edit form.
export function minorToInput(minor: number, currency: string) {
  const digits = currencyDigits(currency);
  const whole = Math.trunc(minor / 10 ** digits);
  const fraction = String(minor % 10 ** digits).padStart(digits, "0");
  return digits === 0 || /^0+$/.test(fraction) ? String(whole) : `${whole}.${fraction}`;
}
