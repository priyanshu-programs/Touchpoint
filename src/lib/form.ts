import { z } from "zod";

// Forms submit an empty string for every untouched field; those are stored as null.
export function blankToNull<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? null : value,
    schema.nullable(),
  );
}

export const text = (max: number) => z.string().trim().max(max);

export function readFields<const Name extends string>(
  formData: FormData,
  names: readonly Name[],
) {
  return Object.fromEntries(
    names.map((name) => {
      const value = formData.get(name);
      return [name, typeof value === "string" ? value : ""];
    }),
  ) as Record<Name, string>;
}
