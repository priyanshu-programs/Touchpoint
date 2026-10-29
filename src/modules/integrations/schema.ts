import { z } from "zod";

export const googleClientInput = z.strictObject({
  clientId: z
    .string()
    .trim()
    .regex(
      /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/,
      "That isn't a Google client ID. It ends in .apps.googleusercontent.com.",
    ),
  clientSecret: z
    .string()
    .trim()
    .min(1, "Enter the client secret.")
    .max(200, "That client secret is too long.")
    .regex(/^\S+$/, "A client secret has no spaces in it."),
});
export type GoogleClientInput = z.infer<typeof googleClientInput>;
