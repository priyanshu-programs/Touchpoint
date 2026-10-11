import { z } from "zod";

// One comma-separated field. Names differing only in case are the same tag.
export const tagList = z
  .string()
  .max(1200)
  .transform((value) => {
    const seen = new Set<string>();
    return value
      .split(",")
      .map((name) => name.trim())
      .filter((name) => {
        const key = name.toLowerCase();
        if (!name || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  })
  .pipe(
    z
      .array(z.string().max(50, "Keep each tag under 50 characters"))
      .max(20, "Use at most 20 tags"),
  );
