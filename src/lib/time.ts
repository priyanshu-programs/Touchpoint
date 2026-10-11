export function formatDateTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

export function formatTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

// For calendar dates ("2026-10-11") that carry no time zone.
export function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

// The runtime's list holds one canonical name per zone (Asia/Calcutta, not Asia/Kolkata),
// so membership would reject valid aliases that browsers report.
export function isTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function wallClock(instant: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)!.value;
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
    seconds: part("second"),
  };
}

// The calendar date in a time zone, as "YYYY-MM-DD".
export function dateIn(timezone: string, instant = new Date()) {
  return wallClock(instant, timezone).date;
}

// An instant as the "YYYY-MM-DDTHH:mm" a datetime-local input shows in that time zone.
export function toLocalInput(instant: Date, timezone: string) {
  const { date, time } = wallClock(instant, timezone);
  return `${date}T${time}`;
}

// The instant at which clocks in the time zone read the given "YYYY-MM-DDTHH:mm".
export function fromLocalInput(local: string, timezone: string) {
  const asUtc = Date.parse(`${local}:00Z`);
  const offsetAt = (instant: number) => {
    const { date, time, seconds } = wallClock(new Date(instant), timezone);
    return Date.parse(`${date}T${time}:${seconds}Z`) - instant;
  };
  // The second pass corrects the first guess when it lands on the other side of a clock change.
  const guess = asUtc - offsetAt(asUtc);
  return new Date(asUtc - offsetAt(guess));
}

export function isFuture(instant: Date) {
  return instant.getTime() > Date.now();
}

export function daysBetween(from: string, to: string) {
  return (
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
    86_400_000
  );
}

export function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}
