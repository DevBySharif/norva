import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  AUTH_SECRET: z.string().min(32).optional(),
  EMAIL_PROVIDER: z.enum(["dev", "resend"]).default("dev"),
  EMAIL_FROM: z.string().min(3).optional(),
  EMAIL_REPLY_TO: z.string().optional(),
  EMAIL_API_KEY: z.string().min(8).optional(),
  EMAIL_CAPTURE_FILE: z.string().min(1).optional(),
  APP_BASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
});

export const env = serverSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  AUTH_SECRET: process.env.AUTH_SECRET,
  EMAIL_PROVIDER: process.env.EMAIL_PROVIDER,
  EMAIL_FROM: process.env.EMAIL_FROM,
  EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
  EMAIL_API_KEY: process.env.EMAIL_API_KEY,
  EMAIL_CAPTURE_FILE: process.env.EMAIL_CAPTURE_FILE,
  APP_BASE_URL: process.env.APP_BASE_URL,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
});

// Production delivery requires concrete credentials. Failing here surfaces the
// misconfiguration at startup instead of at the first transactional email.
if (env.EMAIL_PROVIDER === "resend") {
  if (!env.EMAIL_API_KEY || !env.EMAIL_FROM) {
    throw new Error(
      `EMAIL_PROVIDER is "resend" but EMAIL_API_KEY and/or EMAIL_FROM are missing. ` +
        `Provide both (or switch EMAIL_PROVIDER back to "dev" for local development).`
    );
  }
}

/** Server-visible absolute base URL used when building transactional email links. */
export function getAppBaseUrl(): string {
  return env.APP_BASE_URL ?? env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
