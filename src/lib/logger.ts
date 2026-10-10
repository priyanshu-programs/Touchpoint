type Level = "debug" | "info" | "warn" | "error";

const SENSITIVE_KEY = /pass(word)?|secret|token|authorization|cookie|api[-_]?key/i;
const MAX_DEPTH = 6;

export function redact(value: unknown, depth = 0): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (value === null || typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[truncated]";
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? "[redacted]" : redact(item, depth + 1),
    ]),
  );
}

function write(level: Level, event: string, fields: Record<string, unknown>) {
  const line = JSON.stringify({
    level,
    time: new Date().toISOString(),
    event,
    ...(redact(fields) as Record<string, unknown>),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (event: string, fields: Record<string, unknown> = {}) =>
    write("debug", event, fields),
  info: (event: string, fields: Record<string, unknown> = {}) =>
    write("info", event, fields),
  warn: (event: string, fields: Record<string, unknown> = {}) =>
    write("warn", event, fields),
  error: (event: string, fields: Record<string, unknown> = {}) =>
    write("error", event, fields),
};
