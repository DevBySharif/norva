import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { privateEnv } from "./env";

const CAPTURE_PATH = resolve(process.cwd(), privateEnv("EMAIL_CAPTURE_FILE"));

export type CapturedEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  metadata: Record<string, string>;
  sentAt: string;
};

export function readCapturedEmails(): CapturedEmail[] {
  try {
    const raw = readFileSync(CAPTURE_PATH, "utf8");
    return raw
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as CapturedEmail);
  } catch {
    return [];
  }
}

export function emailsTo(recipient: string): CapturedEmail[] {
  return readCapturedEmails().filter((email) => email.to.toLowerCase() === recipient.toLowerCase());
}

export function latestEmailTo(recipient: string, predicate?: (email: CapturedEmail) => boolean): CapturedEmail | undefined {
  const matches = emailsTo(recipient).filter((email) => predicate?.(email) ?? true);
  return matches[matches.length - 1];
}

export function linkFromText(text: string, path: string): string | null {
  const match = text.match(new RegExp(`${path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\?[^\\s]+`));
  return match ? match[0].trim() : null;
}
