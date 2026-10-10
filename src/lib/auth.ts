import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { count } from "drizzle-orm";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export async function ownerExists() {
  const [row] = await db.select({ total: count() }).from(schema.user);
  return row.total > 0;
}

export const auth = betterAuth({
  appName: "Touchpoint",
  baseURL: env.APP_URL,
  secret: env.AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, minPasswordLength: 12 },
  rateLimit: { enabled: true, storage: "database" },
  advanced: { database: { generateId: "uuid" } },
  telemetry: { enabled: false },
  databaseHooks: {
    user: {
      create: {
        // Single-owner instance: the first account is the only account.
        before: async () => {
          if (await ownerExists()) {
            throw new APIError("FORBIDDEN", {
              message: "This instance already has an owner.",
            });
          }
        },
      },
    },
  },
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      if (!ctx.path.startsWith("/sign-in") && !ctx.path.startsWith("/sign-up")) {
        return;
      }
      logger.info("auth.attempt", {
        path: ctx.path,
        success: Boolean(ctx.context.newSession),
        userId: ctx.context.newSession?.user.id,
        ip: ctx.headers?.get("x-forwarded-for")?.split(",")[0]?.trim(),
      });
    }),
  },
  // nextCookies must stay last so it can set cookies from server actions.
  plugins: [nextCookies()],
});
