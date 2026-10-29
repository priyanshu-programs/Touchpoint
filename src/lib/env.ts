import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  APP_URL: z.url(),
  DATABASE_URL: z.url(),
  AUTH_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(32),
  // "off" keeps company addresses from the outside reader that draws script-built pages.
  WEBSITE_RENDERER: z.enum(["jina", "off"]).default("jina"),
  // Without it, nobody's name is sent out to look for their profile links.
  TAVILY_API_KEY: z.string().min(1).optional(),
  // Without it, Google's client secret and tokens cannot be stored, so Connect is not offered.
  APP_ENCRYPTION_KEY: z.string().min(32).optional(),
});

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Vercel supplies the domain, so APP_URL need not be known before the first deploy.
  // A preview answers on its branch's address, not production's, or its Origin checks would fail.
  const platformUrl =
    source.VERCEL_ENV === "preview"
      ? source.VERCEL_BRANCH_URL
      : source.VERCEL_PROJECT_PRODUCTION_URL;
  const result = schema.safeParse({
    ...source,
    APP_URL:
      source.APP_URL || (platformUrl ? `https://${platformUrl}` : undefined),
    // Left blank in an env file means not set.
    TAVILY_API_KEY: source.TAVILY_API_KEY || undefined,
    APP_ENCRYPTION_KEY: source.APP_ENCRYPTION_KEY || undefined,
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
