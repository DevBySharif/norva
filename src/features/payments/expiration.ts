import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

export type ExpirationResult = {
  expiredPayments: number;
  cancelledOrders: number;
};

/**
 * Finds all online payments that have past their expiration window and marks them FAILED.
 * If an Order has no other active (PAID or PENDING) payments, the Order is marked CANCELLED
 * and its inventory reservation is released.
 */
export async function expirePendingPayments(): Promise<ExpirationResult> {
  const now = new Date();

  // Find payments that are PENDING and expired
  const expiredPayments = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      expiresAt: { lte: now, not: null },
      provider: { not: "COD" }, // COD doesn't expire automatically
    },
    select: { id: true, orderId: true },
  });

  if (expiredPayments.length === 0) {
    return { expiredPayments: 0, cancelledOrders: 0 };
  }

  let expiredCount = 0;
  let cancelledCount = 0;

  for (const { id: paymentId, orderId } of expiredPayments) {
    try {
      await prisma.$transaction(async (tx) => {
        // 1. Mark this specific payment attempt as FAILED (expired)
        const updated = await tx.payment.updateMany({
          where: { id: paymentId, status: "PENDING" },
          data: { status: "FAILED", updatedAt: now },
        });

        if (updated.count === 0) return; // Already processed

        expiredCount += 1;

        await tx.auditLog.create({
          data: {
            action: "PAYMENT_STATUS_CHANGED",
            entityType: "Payment",
            entityId: paymentId,
            metadata: { reason: "EXPIRED", fromStatus: "PENDING", toStatus: "FAILED" },
          },
        });

        // 2. Check the order to see if it should be cancelled.
        // We only cancel the order if there are NO OTHER active payment attempts (PAID or PENDING).
        const activePayments = await tx.payment.count({
          where: {
            orderId,
            status: { in: ["PAID", "PENDING"] },
          },
        });

        if (activePayments === 0) {
          const order = await tx.order.findUnique({
            where: { id: orderId },
            select: { id: true, status: true, orderNumber: true, items: { select: { variantId: true, quantity: true } } },
          });

          // Only cancel if it's still PENDING. If it somehow advanced (e.g. manual admin override), leave it.
          if (order && order.status === "PENDING") {
            const flipped = await tx.order.updateMany({
              where: { id: orderId, status: "PENDING" },
              data: { status: "CANCELLED" },
            });

            if (flipped.count === 1) {
              cancelledCount += 1;

              // Release the inventory reservation
              for (const item of order.items) {
                if (!item.variantId) continue;
                await tx.inventory.updateMany({
                  where: { variantId: item.variantId, reservedQuantity: { gte: item.quantity } },
                  data: { reservedQuantity: { decrement: item.quantity } },
                });
              }

              await tx.orderStatusHistory.create({
                data: {
                  orderId: order.id,
                  status: "CANCELLED",
                  fromStatus: "PENDING",
                  note: "Order cancelled automatically (payment expired)",
                  actorType: "SYSTEM",
                },
              });

              await tx.auditLog.create({
                data: {
                  action: "ORDER_CANCELLED",
                  entityType: "Order",
                  entityId: order.id,
                  metadata: { orderNumber: order.orderNumber, reason: "PAYMENT_EXPIRED", inventoryAction: "release" },
                },
              });
            }
          }
        }
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 });
    } catch (error) {
      console.error(`Error expiring payment ${paymentId}:`, error);
      // Continue to the next payment despite errors
    }
  }

  return { expiredPayments: expiredCount, cancelledOrders: cancelledCount };
}
