import { prisma } from "@/lib/db/prisma";

/** Auth emails (verify / reset) are throttled per recipient + event type. */
export const AUTH_EMAIL_RATE_WINDOW_MS = 60_000;
export const AUTH_EMAIL_RATE_MAX = 3;

/**
 * True when a recipient already received an auth email of this type inside the
 * sliding window. Counted over the outbox ledger, so throttling is observably
 * tied to the same rows the admin notifications screen shows.
 */
export async function isAuthEmailRateLimited(input: { eventType: string; email: string; windowMs?: number; max?: number }): Promise<boolean> {
  const since = new Date(Date.now() - (input.windowMs ?? AUTH_EMAIL_RATE_WINDOW_MS));
  const count = await prisma.notificationOutbox.count({
    where: { eventType: input.eventType, email: input.email.toLowerCase(), createdAt: { gte: since } },
  });
  return count >= (input.max ?? AUTH_EMAIL_RATE_MAX);
}
