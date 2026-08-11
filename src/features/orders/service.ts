import { Prisma, ProductStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { CheckoutInput } from "@/lib/validations/checkout";
import { freeShippingDefault, type PublicShippingMethod } from "./constants";
import { buildOrderNotificationPayload, enqueueOrderNotification, EVENT_BY_STATUS } from "@/features/notifications/outbox";
export type { PublicShippingMethod };

type OrderSummaryShape = {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: Prisma.Decimal;
  shippingTotal: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  payment: { status: string } | null;
};

type TxnOutcome =
  | { kind: "replay"; order: OrderSummaryShape }
  | { kind: "invalid_shipping" }
  | { kind: "blocked"; failedVariantIds: string[] }
  | { kind: "placed"; order: OrderSummaryShape };

export type OrderPlacementResult =
  | {
      ok: true;
      orderNumber: string;
      orderId: string;
      orderStatus: string;
      paymentStatus: string;
      subtotal: string;
      shippingTotal: string;
      grandTotal: string;
      replayed?: boolean;
    }
  | { ok: false; code: "validation" | "empty_cart" | "unavailable" | "out_of_stock" | "invalid_shipping" | "conflict"; message: string; failedVariantIds?: string[] };

const ORDER_SUMMARY_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  subtotal: true,
  shippingTotal: true,
  taxTotal: true,
  discountTotal: true,
  grandTotal: true,
  currency: true,
  payment: { select: { status: true } },
} satisfies Prisma.OrderSelect;

const PUBLIC_ORDER_SELECT = {
  orderNumber: true,
  lookupToken: true,
  status: true,
  subtotal: true,
  shippingTotal: true,
  taxTotal: true,
  discountTotal: true,
  grandTotal: true,
  currency: true,
  email: true,
  createdAt: true,
  shippingAddress: true,
  payment: { select: { provider: true, status: true } },
  items: {
    select: {
      productName: true,
      variantName: true,
      sku: true,
      unitPrice: true,
      quantity: true,
      lineTotal: true,
    },
  },
  statusHistory: { select: { status: true, note: true, createdAt: true }, orderBy: { createdAt: "asc" } },
} satisfies Prisma.OrderSelect;

export function generateOrderNumber(): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const rand = randomBytes(3).toString("hex").toUpperCase();
  return `NORVA-${stamp}-${rand}`;
}

export async function getPublicShippingMethods(): Promise<PublicShippingMethod[]> {
  const methods = await prisma.shippingMethod.findMany({ where: { isActive: true }, orderBy: { price: "asc" }, select: { id: true, name: true, code: true, price: true } });
  return methods.map((m) => ({ ...m, price: new Prisma.Decimal(m.price).toFixed(2) }));
}

export async function getOrderByNumberForPublic(orderNumber: string) {
  return prisma.order.findUnique({ where: { orderNumber }, select: PUBLIC_ORDER_SELECT });
}

function summarize(found: OrderSummaryShape): OrderPlacementResult {
  return {
    ok: true,
    orderNumber: found.orderNumber,
    orderId: found.id,
    orderStatus: found.status,
    paymentStatus: found.payment?.status ?? "PENDING",
    subtotal: new Prisma.Decimal(found.subtotal).toFixed(2),
    shippingTotal: new Prisma.Decimal(found.shippingTotal).toFixed(2),
    grandTotal: new Prisma.Decimal(found.grandTotal).toFixed(2),
  };
}

class StockConflictError extends Error {}

export async function placeOrderCore(input: CheckoutInput, opts?: { userId?: string; saveAddress?: boolean }): Promise<OrderPlacementResult> {
  if (input.items.length === 0) return { ok: false, code: "empty_cart", message: "Your cart is empty." };

  // Idempotency: replay an already-placed order for the same submission token.
  const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: ORDER_SUMMARY_SELECT });
  if (existing) {
    const result = summarize(existing);
    return result.ok ? { ...result, replayed: true } : result;
  }

  const variantIds = input.items.map((i) => i.variantId);

  try {
    const outcome: TxnOutcome = await prisma.$transaction(
      async (tx) => {
        const existingInTxn = await tx.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: ORDER_SUMMARY_SELECT });
        if (existingInTxn) return { kind: "replay", order: existingInTxn };

        const shippingIsFree = !input.shippingMethodCode || input.shippingMethodCode === freeShippingDefault.code;
        let shippingTotal = new Prisma.Decimal(0);
        if (!shippingIsFree) {
          const method = await tx.shippingMethod.findFirst({ where: { code: input.shippingMethodCode, isActive: true }, select: { price: true } });
          if (!method) return { kind: "invalid_shipping" };
          shippingTotal = new Prisma.Decimal(method.price);
        }

        const variants = await tx.productVariant.findMany({
          where: { id: { in: variantIds }, isActive: true, product: { status: ProductStatus.ACTIVE, deletedAt: null } },
          select: {
            id: true,
            sku: true,
            name: true,
            price: true,
            salePrice: true,
            productId: true,
            product: { select: { name: true } },
            inventory: { select: { quantity: true, reservedQuantity: true } },
          },
        });

        const variantsById = new Map(variants.map((v) => [v.id, v]));
        const failedVariantIds: string[] = [];
        const lines: Array<{ variant: (typeof variants)[number]; quantity: number; unitPrice: Prisma.Decimal; lineTotal: Prisma.Decimal }> = [];

        for (const item of input.items) {
          const variant = variantsById.get(item.variantId);
          const unitPrice = variant ? variant.salePrice ?? variant.price : null;
          if (!variant || unitPrice === null) {
            failedVariantIds.push(item.variantId);
            continue;
          }
          const available = (variant.inventory?.quantity ?? 0) - (variant.inventory?.reservedQuantity ?? 0);
          if (available < item.quantity) {
            failedVariantIds.push(item.variantId);
            continue;
          }
          lines.push({ variant, quantity: item.quantity, unitPrice, lineTotal: unitPrice.mul(item.quantity) });
        }

        if (failedVariantIds.length > 0) return { kind: "blocked", failedVariantIds: [...new Set(failedVariantIds)] };

        let subtotal = new Prisma.Decimal(0);
        for (const line of lines) subtotal = subtotal.add(line.lineTotal);
        const grandTotal = subtotal.add(shippingTotal);

        const created = await tx.order.create({
          data: {
            orderNumber: generateOrderNumber(),
            idempotencyKey: input.idempotencyKey,
            lookupToken: randomBytes(16).toString("hex"),
            userId: opts?.userId ?? null,
            email: input.customer.email,
            status: "PENDING",
            subtotal,
            shippingTotal,
            taxTotal: new Prisma.Decimal(0),
            grandTotal,
            currency: "USD",
            shippingAddress: {
              line1: input.shippingAddress.line1,
              line2: input.shippingAddress.line2?.trim() || null,
              city: input.shippingAddress.city,
              state: input.shippingAddress.state,
              postalCode: input.shippingAddress.postalCode,
              country: input.shippingAddress.country,
            },
            items: {
              create: lines.map((line) => ({
                productId: line.variant.productId,
                variantId: line.variant.id,
                productName: line.variant.product.name,
                variantName: line.variant.name,
                sku: line.variant.sku,
                unitPrice: line.unitPrice,
                quantity: line.quantity,
                lineTotal: line.lineTotal,
              })),
            },
            statusHistory: { create: [{ status: "PENDING", note: "Order placed (Cash on Delivery)", actorType: "SYSTEM", fromStatus: null }] },
            payment: { create: { provider: "COD", status: "PENDING", amount: grandTotal, currency: "USD" } },
          },
        });

        // Reserve stock. The Serializable transaction prevents two concurrent orders from both
        // reserving the last unit (the read-write conflict aborts one with P2034), and updateMany
        // additionally refuses to reserve more than the physical quantity.
        for (const line of lines) {
          const reserved = await tx.inventory.updateMany({
            where: { variantId: line.variant.id, quantity: { gte: line.quantity } },
            data: { reservedQuantity: { increment: line.quantity } },
          });
          if (reserved.count !== 1) throw new StockConflictError();
        }

        await tx.auditLog.create({
          data: { action: "ORDER_CREATED", entityType: "Order", entityId: created.id, metadata: { orderNumber: created.orderNumber, provider: "COD", status: "PENDING" } },
        });

        await enqueueOrderNotification(tx, {
          orderId: created.id,
          email: created.email,
          eventType: EVENT_BY_STATUS.CREATED,
          payload: buildOrderNotificationPayload({
            orderId: created.id,
            orderNumber: created.orderNumber,
            email: created.email,
            eventType: EVENT_BY_STATUS.CREATED,
            status: created.status,
            currency: created.currency,
            subtotal: created.subtotal,
            shippingTotal: created.shippingTotal,
            taxTotal: created.taxTotal,
            grandTotal: created.grandTotal,
            createdAt: created.createdAt,
            items: lines.map((line) => ({
              productName: line.variant.product.name,
              sku: line.variant.sku,
              variantName: line.variant.name,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
            })),
          }),
        });

        // Optional "save this address" — owned by the session user, never a client-supplied id.
        if (opts?.userId && opts?.saveAddress) {
          const existingCount = await tx.address.count({ where: { userId: opts.userId } });
          await tx.address.create({
            data: {
              userId: opts.userId,
              label: "Checkout",
              recipientName: input.customer.fullName,
              phone: input.customer.phone,
              line1: input.shippingAddress.line1,
              line2: input.shippingAddress.line2?.trim() || null,
              city: input.shippingAddress.city,
              state: input.shippingAddress.state,
              postalCode: input.shippingAddress.postalCode,
              country: input.shippingAddress.country,
              isDefault: existingCount === 0,
            },
          });
        }

        return {
          kind: "placed",
          order: {
            id: created.id,
            orderNumber: created.orderNumber,
            status: created.status,
            subtotal: created.subtotal,
            shippingTotal: created.shippingTotal,
            grandTotal: created.grandTotal,
            payment: { status: "PENDING" },
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
    );

    if (outcome.kind === "replay") {
      const result = summarize(outcome.order);
      return result.ok ? { ...result, replayed: true } : result;
    }
    if (outcome.kind === "invalid_shipping") return { ok: false, code: "invalid_shipping", message: "The selected shipping method is not available." };
    if (outcome.kind === "blocked") return { ok: false, code: "out_of_stock", message: "Some items are no longer available or are out of stock. Please review your cart.", failedVariantIds: outcome.failedVariantIds };
    return summarize(outcome.order);
  } catch (error) {
    if (error instanceof StockConflictError) {
      return { ok: false, code: "out_of_stock", message: "Stock changed while placing your order. Please review your cart and try again." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const replayed = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: ORDER_SUMMARY_SELECT });
      if (replayed) {
        const result = summarize(replayed);
        return result.ok ? { ...result, replayed: true } : result;
      }
      return { ok: false, code: "conflict", message: "Unable to place your order. Please try again." };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return { ok: false, code: "out_of_stock", message: "Stock changed while placing your order. Please review your cart and try again." };
    }
    throw error;
  }
}