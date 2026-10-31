// What a recorded answer may keep as it came. The repository is public and an answer holds
// the owner's calendar, so anything not listed here is replaced.
const KEPT = new Set([
  "kind",
  "status",
  "eventType",
  "entryPointType",
  "responseStatus",
  "timeZone",
  "accessRole",
  "visibility",
  "transparency",
  "method",
]);
// Dates and times are moved so that a recording doesn't show when the owner was busy.
const DATE_KEYS = new Set(["date", "dateTime", "created", "updated", "timeMin", "timeMax"]);
const BASE = Date.UTC(2030, 0, 7);

const EMAIL = /^[^\s@]+@[^\s@]+$/;

export type Scrubber = (value: unknown) => unknown;

// One scrubber for one recording, so the same person or id keeps one stand-in across its files,
// and the gaps between dates survive.
export function makeScrubber(): Scrubber {
  const stand: Map<string, string> = new Map();
  let origin: number | null = null;

  const standIn = (value: string, make: (index: number) => string) => {
    const known = stand.get(value);
    if (known) return known;
    const made = make(stand.size + 1);
    stand.set(value, made);
    return made;
  };

  const moved = (value: string) => {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const time = new Date(dateOnly ? `${value}T00:00:00Z` : value).getTime();
    if (Number.isNaN(time)) return standIn(value, (index) => `redacted-${index}`);
    origin ??= time;
    const shifted = new Date(BASE + (time - origin)).toISOString();
    return dateOnly ? shifted.slice(0, 10) : shifted;
  };

  const text = (key: string, value: string) => {
    if (KEPT.has(key)) return value;
    if (DATE_KEYS.has(key)) return moved(value);
    if (EMAIL.test(value)) return standIn(value, (index) => `person${index}@example.test`);
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        const host = /(^|\.)google(apis)?\.com$/.test(url.hostname) ? url.hostname : "example.test";
        return standIn(value, (index) => `${url.protocol}//${host}/redacted-${index}`);
      } catch {
        return standIn(value, (index) => `redacted-${index}`);
      }
    }
    return standIn(value, (index) => `redacted-${index}`);
  };

  const walk = (key: string, value: unknown): unknown => {
    if (typeof value === "string") return text(key, value);
    if (Array.isArray(value)) return value.map((item) => walk(key, item));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([name, inner]) => [name, walk(name, inner)]),
      );
    }
    return value;
  };

  return (value) => walk("", value);
}
