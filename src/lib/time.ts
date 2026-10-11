export function formatDateTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
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
