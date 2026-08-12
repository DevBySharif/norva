import "server-only";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { env } from "@/lib/env";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export interface EmailProvider {
  /** Stable identifier recorded on outbox rows for observability. */
  readonly name: string;
  /** Delivers a single message. Must throw on failure so the outbox can retry. */
  send(message: EmailMessage): Promise<void>;
}

/** Replaces bearer tokens (verify/reset links) so console summaries never leak them. */
export function redactEmailTokens(value: string): string {
  return value.replace(/([?&](?:token|access)=)[^&\s"']+/g, "$1***");
}

const CAPTURE_FILE = resolve(process.cwd(), env.EMAIL_CAPTURE_FILE ?? "test-results/email-capture.jsonl");

function writeCapture(message: EmailMessage): void {
  mkdirSync(dirname(CAPTURE_FILE), { recursive: true });
  const record = {
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    metadata: message.metadata ?? {},
    sentAt: new Date().toISOString(),
  };
  appendFileSync(CAPTURE_FILE, `${JSON.stringify(record)}\n`, "utf8");
}

/**
 * Local/test provider. Never performs real delivery. Writes each message to a
 * gitignored JSONL capture file (used by Vitest/Playwright assertions) and logs
 * a redacted one-line summary so tokens never appear in the console.
 */
export const devEmailProvider: EmailProvider = {
  name: "dev",
  async send(message) {
    writeCapture(message);
    console.log(
      `[email:dev] to=${message.to} subject=${JSON.stringify(redactEmailTokens(message.subject))}` +
        ` meta=${JSON.stringify(redactEmailTokens(JSON.stringify(message.metadata ?? {})))}`
    );
  },
};

/**
 * Production provider for Resend (https://resend.com). Modern transactional API
 * with domain verification and simple Node support. Uses the HTTP API directly
 * to avoid a runtime dependency; credentials come only from the environment.
 */
export const resendEmailProvider: EmailProvider = {
  name: "resend",
  async send(message) {
    const apiKey = env.EMAIL_API_KEY;
    const from = env.EMAIL_FROM;
    if (!apiKey || !from) {
      throw new Error("Resend provider is not configured (EMAIL_API_KEY / EMAIL_FROM).");
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
        ...(env.EMAIL_REPLY_TO ? { reply_to: env.EMAIL_REPLY_TO } : {}),
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Email delivery failed (HTTP ${response.status})${body ? `: ${body.slice(0, 300)}` : ""}`);
    }
  },
};

/** Selects the active provider from the environment (default: dev/file capture). */
export function getEmailProvider(): EmailProvider {
  return env.EMAIL_PROVIDER === "resend" ? resendEmailProvider : devEmailProvider;
}
