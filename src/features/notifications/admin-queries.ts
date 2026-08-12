import { Prisma, type NotificationStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

const LIST_SELECT = {
  id: true,
  eventType: true,
  email: true,
  status: true,
  attempts: true,
  provider: true,
  lastError: true,
  createdAt: true,
  sentAt: true,
  nextAttemptAt: true,
  orderId: true,
} satisfies Prisma.NotificationOutboxSelect;

export type AdminNotificationRow = Prisma.NotificationOutboxGetPayload<{ select: typeof LIST_SELECT }>;

export const NOTIFICATION_STATUSES: NotificationStatus[] = ["PENDING", "PROCESSING", "SENT", "FAILED"];

export async function getNotificationLog(input: { status?: string; take?: number }) {
  const status = (input.status as NotificationStatus | undefined) ?? undefined;
  const where = status ? { status } : {};
  const [rows, grouped] = await Promise.all([
    prisma.notificationOutbox.findMany({ where, orderBy: { createdAt: "desc" }, take: input.take ?? 100, select: LIST_SELECT }),
    prisma.notificationOutbox.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
  return { rows, counts };
}
