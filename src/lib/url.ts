import { z } from "zod";

export function isHttpUrl(value: string) {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

// Stored links are rendered as href values, so schemes such as javascript: must never get in.
export const httpUrl = z
  .string()
  .trim()
  .max(2000)
  .refine(isHttpUrl, {
    message: "Enter a link that starts with http:// or https://",
  });
