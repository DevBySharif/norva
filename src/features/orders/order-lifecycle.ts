import { Prisma, type OrderStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { availableTransitionsFrom, canTransition, inventoryActionFor } from "./state-machine";
import {
  buildOrderNotificationPayload,
  enqueueOrderNotification,
  type OrderNotificationEvent,
  type OrderNotificationPayload,
} from "@/features/notifications/outbox";

export type OrderTransitionActor = { type: "ADMIN"; userId?: string } | { type: "SYSTEM" };

export type OrderMutationResult =
  | { ok: true; orderId: string; orderNumber: string; fromStatus?: string; toStatus: string; inventoryAction?: string }
  | { ok: false; code: "not_found" | "invalid_transition" | "already_processed" | "conflict"; message: string };

class OrderMutationConflictError extends Error {}

const NOTIFY_TRANSITIONS: Partial<Record<OrderStatus, OrderNotificationEvent>> = {
  CONFIRMED: "ORDER_CONFIRMED",
  SHIPPED: "ORDER_SHIPPED",
  DELIVERED: "ORDER_DELIVERED",
  CANCELLED: "ORDER_CANCELLED",
};

/**
 * Resolves the acting staff member for audit attribution. AuditLog.userId is a
 * foreign key, so a stale or synthetic actor id must never abort a mutation —
 * the audit row falls back to an anonymous entry while the historical status
 * row keeps the raw id for accountability.
 */
async function resolveAdminUserId(tx: Prisma.TransactionClient, actor: OrderTransitionActor): Promise<string | null> {
  if (actor.type !== "ADMIN" || !actor.userId) return null;
  const existing = await tx.user.findUnique({ where: { id: actor.userId }, select: { id: true } });
  return existing ? existing.id : null;
}

const NOTIFICATION_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  email: true,
  status: true,
  subtotal: true,
  shippingTotal: true,
  taxTotal: true,
  grandTotal: true,
  currency: true,
  createdAt: true,
  items: {
    select: {
      productName: true,
      variantName: true,
      sku: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
    },
  },
} satisfies Prisma.OrderSelect;

export { availableTransitionsFrom };

/**
 * Moves an order between statuses atomically. Any inventory effect, history
 * row, audit trail, payment settlement and notification are committed in one
 * Serializable transaction. A lost race always resolves to a friendly
 * "conflict" rather than a partial mutation.
 */
export async function transitionOrderStatusCore(
  orderId: string,
  toStatus: OrderStatus,
  opts: { actor: OrderTransitionActor; note?: string | null; internalNote?: string | null } = { actor: { type: "SYSTEM" } }
): Promise<OrderMutationResult> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: { id: true, orderNumber: true, status: true, email: true },
        });
        if (!order) return { ok: false, code: "not_found", message: "This order could not be found." };

        if (order.status === toStatus) {
          return {
            ok: false,
            code: "already_processed",
            message: `This order is already marked as ${toStatus.replace(/_/g, " ").toLowerCase()}.`,
          };
        }
        if (!canTransition(order.status, toStatus)) {
          return { ok: false, code: "invalid_transition", message: `An order in ${order.status} cannot be moved to ${toStatus}.` };
        }

        const inventoryAction = inventoryActionFor(order.status, toStatus);
        const lines = await tx.orderItem.findMany({ where: { orderId }, select: { variantId: true, quantity: true } });

        if (inventoryAction === "finalize") {
          // Commit physical stock at shipment. The guarded updateMany is the
          // atomic predicate: it can only consume stock the reservation holds,
          // so quantities can never go negative.
          for (const item of lines) {
            if (!item.variantId) continue;
            const updated = await tx.inventory.updateMany({
              where: { variantId: item.variantId, reservedQuantity: { gte: item.quantity }, quantity: { gte: item.quantity } },
              data: { quantity: { decrement: item.quantity }, reservedQuantity: { decrement: item.quantity } },
            });
            if (updated.count !== 1) {
              throw new OrderMutationConflictError("Reserved stock for this order could not be finalized. Please refresh and try again.");
            }
          }
        } else if (inventoryAction === "release") {
          // Cancellation pre-shipment returns the reservation to sellable stock.
          for (const item of lines) {
            if (!item.variantId) continue;
            await tx.inventory.updateMany({
              where: { variantId: item.variantId, reservedQuantity: { gte: item.quantity } },
              data: { reservedQuantity: { decrement: item.quantity } },
            });
          }
        }

        // Predicated flip: only succeeds while the order is still in the state
        // we validated. The loser aborts and rolls back its inventory writes.
        const flipped = await tx.order.updateMany({
          where: { id: orderId, status: order.status },
          data: { status: toStatus },
        });
        if (flipped.count !== 1) {
          throw new OrderMutationConflictError("This order was updated while you were working. Please refresh and try again.");
        }

        const adminUserId = await resolveAdminUserId(tx, opts.actor);
        const auditAction = toStatus === "CANCELLED" ? "ORDER_CANCELLED" : "ORDER_STATUS_CHANGED";

        await tx.auditLog.create({
          data: {
            userId: adminUserId,
            action: auditAction,
            entityType: "Order",
            entityId: orderId,
            metadata: { orderNumber: order.orderNumber, fromStatus: order.status, toStatus, inventoryAction },
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId,
            status: toStatus,
            fromStatus: order.status,
            note: opts.note ?? null,
            internalNote: opts.internalNote ?? null,
            actorType: opts.actor.type,
            actorUserId: opts.actor.type === "ADMIN" ? (opts.actor.userId ?? null) : null,
          },
        });

        if (toStatus === "DELIVERED") {
          const payment = await tx.payment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
          if (payment && payment.provider.toUpperCase() === "COD" && payment.status === "PENDING") {
            await tx.payment.update({ where: { id: payment.id }, data: { status: "PAID" } });
            await tx.auditLog.create({
              data: {
                userId: adminUserId,
                action: "PAYMENT_STATUS_CHANGED",
                entityType: "Payment",
                entityId: payment.id,
                metadata: { orderNumber: order.orderNumber, fromStatus: "PENDING", toStatus: "PAID" },
              },
            });
          }
        }

        const eventType = NOTIFY_TRANSITIONS[toStatus];
        if (eventType) {
          const snapshot = await tx.order.findUnique({ where: { id: orderId }, select: NOTIFICATION_ORDER_SELECT });
          if (snapshot) {
            const payload: OrderNotificationPayload = buildOrderNotificationPayload({
              orderId,
              orderNumber: snapshot.orderNumber,
              email: snapshot.email,
              eventType,
              status: snapshot.status,
              currency: snapshot.currency,
              subtotal: snapshot.subtotal,
              shippingTotal: snapshot.shippingTotal,
              taxTotal: snapshot.taxTotal,
              grandTotal: snapshot.grandTotal,
              createdAt: snapshot.createdAt,
              items: snapshot.items.map((item) => ({
                productName: item.productName,
                sku: item.sku,
                variantName: item.variantName,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                lineTotal: item.lineTotal,
              })),
            });
            await enqueueOrderNotification(tx, { orderId, email: snapshot.email, eventType, payload });
          }
        }

        return { ok: true, orderId, orderNumber: order.orderNumber, fromStatus: order.status, toStatus, inventoryAction } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
    );
  } catch (error) {
    if (error instanceof OrderMutationConflictError) return { ok: false, code: "conflict", message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { ok: false, code: "conflict", message: "This order was being processed by another update. Please refresh and try again." };
    }
    throw error;
  }
}

/**
 * Records receipt of cash on delivery, settling a PENDING COD payment. This is
 * separate from the order status flow so payment can be captured at any point
 * (e.g. at the door on delivery) without moving the order forward.
 */
export async function markPaymentReceivedCore(orderId: string, actor: OrderTransitionActor): Promise<OrderMutationResult> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, orderNumber: true, status: true } });
        if (!order) return { ok: false, code: "not_found", message: "This order could not be found." };
        if (order.status === "CANCELLED" || order.status === "REFUNDED") {
          return { ok: false, code: "invalid_transition", message: `Payment cannot be received for a ${order.status.toLowerCase()} order.` };
        }

        const payment = await tx.payment.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
        if (!payment) return { ok: false, code: "not_found", message: "This order has no payment record." };
        if (payment.provider.toUpperCase() !== "COD") {
          return { ok: false, code: "invalid_transition", message: "Only cash on delivery orders can be marked as received at the door." };
        }
        if (payment.status === "PAID") {
          return { ok: false, code: "already_processed", message: "Payment for this order was already received." };
        }

        const paid = await tx.payment.updateMany({ where: { id: payment.id, status: "PENDING" }, data: { status: "PAID" } });
        if (paid.count !== 1) {
          throw new OrderMutationConflictError("Payment for this order was updated while you were working. Please refresh and try again.");
        }

        await tx.auditLog.create({
          data: {
            userId: await resolveAdminUserId(tx, actor),
            action: "PAYMENT_STATUS_CHANGED",
            entityType: "Payment",
            entityId: payment.id,
            metadata: { orderNumber: order.orderNumber, fromStatus: "PENDING", toStatus: "PAID" },
          },
        });

        return { ok: true, orderId, orderNumber: order.orderNumber, fromStatus: "PENDING", toStatus: "PAID" } as const;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
    );
  } catch (error) {
    if (error instanceof OrderMutationConflictError) return { ok: false, code: "conflict", message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { ok: false, code: "conflict", message: "This order was busy. Please refresh and try again." };
    }
    throw error;
  }
}