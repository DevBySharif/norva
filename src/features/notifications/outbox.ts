import { Prisma, type NotificationOutbox } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { orderStatusLabel } from "@/features/orders/constants";
import { getEmailProvider, type EmailMessage, type EmailProvider } from "./provider";
import { orderEmailTemplate } from "./templates";
import { buildGuestOrderLink } from "./links";

export type OrderNotificationEvent = "ORDER_CREATED" | "ORDER_CONFIRMED" | "ORDER_SHIPPED" | "ORDER_DELIVERED" | "ORDER_CANCELLED";

export type AuthNotificationEvent = "VERIFY_EMAIL" | "PASSWORD_RESET_REQUESTED";

export type NotificationEventType = OrderNotificationEvent | AuthNotificationEvent;

export type OrderNotificationPayload = {
  orderId: string;
  orderNumber: string;
  email: string;
  eventType: OrderNotificationEvent;
  status: string;
  currency: string;
  subtotal: string;
  shippingTotal: string;
  taxTotal: string;
  grandTotal: string;
  createdAt: string;
  guestUrl?: string | null;
  items: Array<{
    productName: string;
    sku: string;
    variantName: string | null;
    quantity: number;
    unitPrice: string;
    lineTotal: string;
  }>;
};

export const EVENT_BY_STATUS: Record<string, OrderNotificationEvent> = {
  CREATED: "ORDER_CREATED",
  CONFIRMED: "ORDER_CONFIRMED",
  SHIPPED: "ORDER_SHIPPED",
  DELIVERED: "ORDER_DELIVERED",
  CANCELLED: "ORDER_CANCELLED",
};

type MoneyInput = Prisma.Decimal | number | string;

/**
 * Builds a customer-safe notification snapshot for an order. Only fields a
 * customer email may see are included — never cost prices, audit events, or
 * staff notes.
 */
export function buildOrderNotificationPayload(input: {
  orderId: string;
  orderNumber: string;
  email: string;
  eventType: OrderNotificationEvent;
  status: string;
  currency: string;
  subtotal: MoneyInput;
  shippingTotal: MoneyInput;
  taxTotal: MoneyInput;
  grandTotal: MoneyInput;
  createdAt: Date | string;
  guestUrl?: string | null;
  items: Array<{
    productName: string;
    sku: string;
    variantName: string | null;
    quantity: number;
    unitPrice: MoneyInput;
    lineTotal: MoneyInput;
  }>;
}): OrderNotificationPayload {
  const money = (value: MoneyInput) => new Prisma.Decimal(value).toFixed(2);
  return {
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    email: input.email,
    eventType: input.eventType,
    status: input.status,
    currency: input.currency,
    subtotal: money(input.subtotal),
    shippingTotal: money(input.shippingTotal),
    taxTotal: money(input.taxTotal),
    grandTotal: money(input.grandTotal),
    createdAt: new Date(input.createdAt).toISOString(),
    guestUrl: input.guestUrl ?? null,
    items: input.items.map((item) => ({
      productName: item.productName,
      sku: item.sku,
      variantName: item.variantName,
      quantity: item.quantity,
      unitPrice: money(item.unitPrice),
      lineTotal: money(item.lineTotal),
    })),
  };
}

type EnqueueParams = {
  eventType: NotificationEventType;
  email: string;
  payload: Prisma.InputJsonValue;
  /** Stable unique key that prevents duplicate events (e.g. `${orderId}:${eventType}`). */
  eventKey?: string;
  orderId?: string | null;
  /** "outbox" = delivered by the processor; "inline" = delivered immediately with ephemeral data. */
  provider?: "outbox" | "inline";
};

/** Creates a notification intent inside the caller's transaction. */
export async function enqueueNotification(tx: Prisma.TransactionClient, params: EnqueueParams) {
  return tx.notificationOutbox.create({
    data: {
      orderId: params.orderId ?? null,
      email: params.email,
      eventType: params.eventType,
      status: "PENDING",
      attempts: 0,
      provider: params.provider ?? "outbox",
      payload: params.payload,
      eventKey: params.eventKey ?? null,
      nextAttemptAt: new Date(),
    },
  });
}

/** Order lifecycle notifications share one row per order+event (idempotent). */
export async function enqueueOrderNotification(
  tx: Prisma.TransactionClient,
  params: { orderId: string; email: string; eventType: OrderNotificationEvent; payload: OrderNotificationPayload }
) {
  return enqueueNotification(tx, {
    orderId: params.orderId,
    email: params.email,
    eventType: params.eventType,
    payload: params.payload as Prisma.InputJsonValue,
    eventKey: `${params.orderId}:${params.eventType}`,
    provider: "outbox",
  });
}

/**
 * Auth notifications (verify email / password reset) are delivered inline with
 * ephemeral data, so their outbox rows use provider "inline" and are skipped by
 * the processor. The payload stores only the token record reference — the raw
 * token itself never touches the database.
 */
export async function enqueueAuthNotification(
  tx: Prisma.TransactionClient,
  params: {
    eventKey?: string;
    eventType: AuthNotificationEvent;
    email: string;
    userId: string;
    tokenRecordId: string;
    path: "/verify-email" | "/reset-password";
  }
) {
  return enqueueNotification(tx, {
    eventType: params.eventType,
    email: params.email,
    payload: {
      eventType: params.eventType,
      userId: params.userId,
      tokenRecordId: params.tokenRecordId,
      path: params.path,
    } as Prisma.InputJsonValue,
    eventKey: params.eventKey ?? `${params.eventType}:${params.userId}:${params.tokenRecordId}`,
    provider: "inline",
  });
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Notification delivery failed";
  return message.replace(/([?&](?:token|access|key)=)[^&\s"']+/g, "$1***").slice(0, 500);
}

const RETRY_DELAY_MINUTES = [0, 1, 5, 15, 30];

function nextRetryAt(attempts: number, now: Date): Date {
  const minutes = RETRY_DELAY_MINUTES[Math.min(attempts - 1, RETRY_DELAY_MINUTES.length - 1)] ?? 30;
  return new Date(now.getTime() + minutes * 60_000);
}

function renderOrderMessage(item: NotificationOutbox): EmailMessage {
  const payload = item.payload as unknown as OrderNotificationPayload;
  if (!payload?.orderNumber || !Array.isArray(payload.items)) {
    throw new Error("Malformed order notification payload.");
  }
  const { subject, text, html } = orderEmailTemplate({
    eventType: payload.eventType,
    orderNumber: payload.orderNumber,
    statusLabel: orderStatusLabel(payload.status),
    email: payload.email,
    currency: payload.currency,
    subtotal: payload.subtotal,
    shippingTotal: payload.shippingTotal,
    taxTotal: payload.taxTotal,
    grandTotal: payload.grandTotal,
    createdAt: new Date(payload.createdAt).toLocaleString(),
    guestUrl: payload.guestUrl ?? null,
    items: payload.items,
  });
  return {
    to: item.email,
    subject,
    text,
    html,
    metadata: { eventType: item.eventType, orderNumber: payload.orderNumber },
  };
}

/** Builds the outbound message for an outbox row (order events only). */
export function renderNotification(item: NotificationOutbox): EmailMessage {
  return renderOrderMessage(item);
}

export type ProcessOutboxResult = { attempted: number; delivered: number; failed: number };

const STALE_PROCESSING_MS = 5 * 60_000;

/**
 * Delivers pending notifications. Safe to run concurrently:
 * each row is atomically claimed (PENDING -> PROCESSING), so two processors can
 * never both deliver the same event. Failures are re-queued with bounded retries
 * and eventually marked FAILED. Inline (auth) events are skipped — they carry
 * ephemeral data and are delivered immediately at creation.
 */
export async function processPendingNotifications(opts: { provider?: EmailProvider; take?: number; maxAttempts?: number; now?: Date } = {}): Promise<ProcessOutboxResult> {
  const now = opts.now ?? new Date();
  const provider = opts.provider ?? getEmailProvider();
  const maxAttempts = opts.maxAttempts ?? 5;
  const take = opts.take ?? 50;

  // Recover rows abandoned mid-flight by a crashed processor.
  await prisma.notificationOutbox.updateMany({
    where: { status: "PROCESSING", updatedAt: { lt: new Date(now.getTime() - STALE_PROCESSING_MS) } },
    data: { status: "PENDING", nextAttemptAt: now },
  });

  const pending = await prisma.notificationOutbox.findMany({
    where: { status: "PENDING", provider: { not: "inline" }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    orderBy: { createdAt: "asc" },
    take,
  });

  let delivered = 0;
  let failed = 0;

  for (const item of pending) {
    const claimed = await prisma.notificationOutbox.updateMany({
      where: { id: item.id, status: "PENDING" },
      data: { status: "PROCESSING", attempts: { increment: 1 }, lastAttemptAt: now },
    });
    if (claimed.count !== 1) continue; // another processor won the claim

    const attempts = item.attempts + 1;
    try {
      const message = renderOrderMessage(item);
      await provider.send(message);
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: { status: "SENT", sentAt: new Date(), provider: provider.name, lastError: null, updatedAt: new Date() },
      });
      delivered += 1;
    } catch (error) {
      const terminal = attempts >= maxAttempts;
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: terminal
          ? { status: "FAILED", lastError: sanitizeError(error), updatedAt: new Date() }
          : { status: "PENDING", lastError: sanitizeError(error), nextAttemptAt: nextRetryAt(attempts, now), updatedAt: new Date() },
      });
      failed += 1;
    }
  }

  return { attempted: pending.length, delivered, failed };
}

/** Admin retry: resets a FAILED row to PENDING with a fresh retry budget. */
export async function retryNotification(id: string): Promise<void> {
  await prisma.notificationOutbox.update({
    where: { id },
    data: { status: "PENDING", attempts: 0, lastError: null, nextAttemptAt: new Date(), updatedAt: new Date() },
  });
}

/** Marks an auth (inline-delivered) outbox row SENT after direct delivery. */
export async function markInlineDelivered(outboxId: string, providerName: string): Promise<void> {
  await prisma.notificationOutbox.update({
    where: { id: outboxId },
    data: { status: "SENT", sentAt: new Date(), provider: providerName, attempts: { increment: 1 }, updatedAt: new Date() },
  });
}

/** Marks an auth (inline-delivered) outbox row FAILED; the customer can resend for a fresh link. */
export async function markInlineFailed(outboxId: string, error: unknown): Promise<void> {
  await prisma.notificationOutbox.update({
    where: { id: outboxId },
    data: { status: "FAILED", lastError: sanitizeError(error), attempts: { increment: 1 }, updatedAt: new Date() },
  });
}

export function buildOrderGuestUrl(order: { orderNumber: string; lookupToken: string | null; userId: string | null }): string | null {
  if (!order.userId && order.lookupToken) return buildGuestOrderLink(order.orderNumber, order.lookupToken);
  return null;
}
