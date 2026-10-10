import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z.url(),
  DATABASE_URL: z.url(),
  AUTH_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(32),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Vercel supplies the production domain, so APP_URL need not be known before the first deploy.
  const platformUrl = source.VERCEL_PROJECT_PRODUCTION_URL;
  const result = schema.safeParse({
    ...source,
    APP_URL:
      source.APP_URL || (platformUrl ? `https://${platformUrl}` : undefined),
  });
  if (!result.success) {
    // Names only: the values may be secrets.
    const names = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];
    throw new Error(
      `Invalid or missing environment variables: ${names.join(", ")}. See .env.example.`,
    );
  }
  return result.data;
}

export const env = parseEnv(process.env);
