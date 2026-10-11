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

export const emailAddress = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email("Enter a valid email address"));

// A number as it is written on a letterhead, separators kept: "+91 (20) 5550-1234".
export const phoneNumber = text(40).refine(
  (value) => {
    const digits = value.replace(/\D/g, "").length;
    return /^\+?[0-9][0-9 ().-]*$/.test(value) && digits >= 7 && digits <= 15;
  },
  { message: "Enter a phone number, such as +91 20 5550 1234" },
);

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
