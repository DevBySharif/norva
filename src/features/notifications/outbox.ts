import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getNotificationSender } from "./client";

export type OrderNotificationEvent = "ORDER_CREATED" | "ORDER_CONFIRMED" | "ORDER_SHIPPED" | "ORDER_DELIVERED" | "ORDER_CANCELLED";

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

export async function enqueueOrderNotification(
  tx: Prisma.TransactionClient,
  params: { orderId: string; email: string; eventType: string; payload: OrderNotificationPayload }
) {
  return tx.notificationOutbox.create({
    data: {
      orderId: params.orderId,
      email: params.email,
      eventType: params.eventType,
      status: "PENDING",
      provider: "log",
      payload: params.payload as Prisma.InputJsonValue,
    },
  });
}

/** Non-transactional sweep used by scheduled/worker contexts. */
export async function processPendingNotifications(take = 50): Promise<number> {
  const pending = await prisma.notificationOutbox.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    take,
  });
  const sender = getNotificationSender();
  for (const item of pending) {
    try {
      await sender.send(item.payload);
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
      });
    } catch (error) {
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: {
          status: "FAILED",
          lastError: error instanceof Error ? error.message : "Notification delivery failed",
          attempts: { increment: 1 },
        },
      });
    }
  }
  return pending.length;
}