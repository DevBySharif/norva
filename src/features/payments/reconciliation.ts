import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { PaymentValidationResult } from "./types";
import {
  buildOrderNotificationPayload,
  enqueueOrderNotification,
  EVENT_BY_STATUS,
} from "@/features/notifications/outbox";

class PaymentReconciliationError extends Error {}

/**
 * Reconciles a validated payment event (from IPN or success callback).
 * Strictly checks the amount and currency. Updates payment, order status,
 * audit log, and outbox transactionally.
 */
export async function reconcilePayment(
  orderNumber: string,
  validation: Extract<PaymentValidationResult, { ok: true }>
): Promise<{ ok: true; orderId: string } | { ok: false; message: string }> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        const order = await tx.order.findUnique({
          where: { orderNumber },
          include: { payments: { orderBy: { createdAt: "desc" } }, items: true },
        });

        if (!order) return { ok: false, message: "Order not found" };

        const payment = order.payments.find((p) => p.status === "PENDING");
        if (!payment) {
          // If already PAID, this is a replay or late IPN. Idempotent.
          if (order.payments.some((p) => p.status === "PAID")) {
            return { ok: true, orderId: order.id }; // Already processed
          }
          return { ok: false, message: "No pending payment found for this order" };
        }

        // 1. Amount mismatch verification
        const orderAmount = Number(payment.amount);
        const reportedAmount = Number(validation.amount);
        if (Math.abs(orderAmount - reportedAmount) > 0.01) {
          await tx.auditLog.create({
            data: {
              action: "PAYMENT_RECONCILIATION_FAILED",
              entityType: "Payment",
              entityId: payment.id,
              metadata: { orderNumber, reason: "Amount mismatch", orderAmount, reportedAmount },
            },
          });
          return { ok: false, message: "Amount mismatch" };
        }

        if (payment.currency.toUpperCase() !== validation.currency.toUpperCase()) {
          await tx.auditLog.create({
            data: {
              action: "PAYMENT_RECONCILIATION_FAILED",
              entityType: "Payment",
              entityId: payment.id,
              metadata: { orderNumber, reason: "Currency mismatch", expected: payment.currency, reported: validation.currency },
            },
          });
          return { ok: false, message: "Currency mismatch" };
        }

        // 2. State transition
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: validation.status === "CANCELLED" ? "FAILED" : validation.status,
            providerReference: validation.providerReference,
            metadata: validation.rawPayload ? (validation.rawPayload as Prisma.InputJsonValue) : Prisma.JsonNull,
          },
        });

        await tx.auditLog.create({
          data: {
            action: "PAYMENT_STATUS_CHANGED",
            entityType: "Payment",
            entityId: payment.id,
            metadata: { orderNumber, provider: payment.provider, fromStatus: "PENDING", toStatus: validation.status },
          },
        });

        if (validation.status === "PAID") {
          // Only transition the order to CONFIRMED if it's currently PENDING.
          if (order.status === "PENDING") {
            await tx.order.update({
              where: { id: order.id },
              data: { status: "CONFIRMED" },
            });
            await tx.orderStatusHistory.create({
              data: {
                orderId: order.id,
                status: "CONFIRMED",
                fromStatus: "PENDING",
                note: "Payment received online",
                actorType: "SYSTEM",
              },
            });
            await tx.auditLog.create({
              data: {
                action: "ORDER_STATUS_CHANGED",
                entityType: "Order",
                entityId: order.id,
                metadata: { orderNumber, fromStatus: "PENDING", toStatus: "CONFIRMED" },
              },
            });
          }

          // Enqueue success notification (Optional since Order Confirmation email may suffice, but we add an event)
          await enqueueOrderNotification(tx, {
            orderId: order.id,
            email: order.email,
            eventType: "ORDER_CONFIRMED",
            payload: buildOrderNotificationPayload({
              orderId: order.id,
              orderNumber: order.orderNumber,
              email: order.email,
              eventType: "ORDER_CONFIRMED",
              status: order.status,
              currency: order.currency,
              subtotal: order.subtotal,
              shippingTotal: order.shippingTotal,
              taxTotal: order.taxTotal,
              grandTotal: order.grandTotal,
              createdAt: order.createdAt,
              items: order.items.map((i) => ({
                productName: i.productName,
                sku: i.sku,
                variantName: i.variantName,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                lineTotal: i.lineTotal,
              })),
            }),
          });
        }

        return { ok: true, orderId: order.id };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { ok: false, message: "Concurrent update prevented reconciliation. Try again." };
    }
    throw error;
  }
}
