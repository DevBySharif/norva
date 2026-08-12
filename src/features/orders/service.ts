import { Prisma, ProductStatus } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import type { CheckoutInput } from "@/lib/validations/checkout";
import { type PublicShippingMethod } from "./constants";
import { buildOrderGuestUrl, buildOrderNotificationPayload, enqueueOrderNotification, EVENT_BY_STATUS } from "@/features/notifications/outbox";
import { getPaymentProvider } from "@/features/payments";
import { getStoreSettings } from "@/features/store/settings";
export type { PublicShippingMethod };

type OrderSummaryShape = {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: Prisma.Decimal;
  shippingTotal: Prisma.Decimal;
  grandTotal: Prisma.Decimal;
  payments: Array<{ id: string, status: string, provider: string }> | null;
  lookupToken: string | null;
  userId: string | null;
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
      paymentRedirectUrl?: string;
    }
  | { ok: false; code: "validation" | "empty_cart" | "unavailable" | "out_of_stock" | "invalid_shipping" | "conflict" | "payment_init_failed"; message: string; failedVariantIds?: string[] };

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
  lookupToken: true,
  userId: true,
  payments: { select: { id: true, status: true, provider: true }, orderBy: { createdAt: 'desc' }, take: 1 },
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
  payments: { select: { provider: true, status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
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
    paymentStatus: found.payments?.[0]?.status ?? "PENDING",
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

        // Calculate subtotal first to evaluate free shipping threshold
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

        // Fetch Store Settings & calculate Shipping
        const storeSettings = await getStoreSettings();
        let shippingTotal = new Prisma.Decimal(0);
        
        const standardMethod = await tx.shippingMethod.findFirst({ where: { isActive: true }, orderBy: { price: 'asc' } });
        
        if (storeSettings.freeShippingThreshold && subtotal.gte(storeSettings.freeShippingThreshold)) {
          shippingTotal = new Prisma.Decimal(0);
        } else if (standardMethod) {
          shippingTotal = standardMethod.price;
        } else if (!standardMethod && input.shippingMethodCode) {
           return { kind: "invalid_shipping" };
        }

        // Validate Coupon & Calculate Discount
        let discountTotal = new Prisma.Decimal(0);
        let appliedCouponId: string | null = null;
        
        if (input.couponCode) {
          const normalizedCode = input.couponCode.trim().toUpperCase();
          const coupon = await tx.coupon.findUnique({ where: { code: normalizedCode } });
          if (coupon && coupon.isActive) {
            const now = new Date();
            const validTiming = (!coupon.startsAt || now >= coupon.startsAt) && (!coupon.expiresAt || now <= coupon.expiresAt);
            const validLimit = coupon.usageLimit === null || coupon.usageCount < coupon.usageLimit;
            const validSubtotal = coupon.minimumSubtotal === null || subtotal.gte(coupon.minimumSubtotal);
            
            if (validTiming && validLimit && validSubtotal) {
              appliedCouponId = coupon.id;
              
              if (coupon.type === "PERCENTAGE") {
                let p = coupon.value;
                if (p.lt(0)) p = new Prisma.Decimal(0);
                if (p.gt(100)) p = new Prisma.Decimal(100);
                discountTotal = subtotal.mul(p).div(100);
              } else if (coupon.type === "FIXED_AMOUNT") {
                discountTotal = coupon.value.gt(subtotal) ? subtotal : coupon.value;
              }
            }
          }
        }

        const grandTotal = subtotal.sub(discountTotal).add(shippingTotal);

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
            discountTotal,
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
            statusHistory: { create: [{ status: "PENDING", note: `Order placed (${input.paymentMethod})`, actorType: "SYSTEM", fromStatus: null }] },
            payments: {
              create: [
                {
                  provider: input.paymentMethod === "ONLINE" ? getPaymentProvider().providerName : "COD",
                  status: "PENDING",
                  amount: grandTotal,
                  currency: "USD",
                  expiresAt: input.paymentMethod === "ONLINE" ? new Date(Date.now() + 30 * 60000) : null,
                },
              ],
            },
            ...(appliedCouponId && {
              couponUsage: {
                create: {
                  couponId: appliedCouponId,
                  userId: opts?.userId ?? null,
                }
              }
            })
          },
        });

        // Apply Coupon Usage Count Increment transactionally
        if (appliedCouponId) {
          const updatedCoupon = await tx.coupon.update({
            where: { id: appliedCouponId },
            data: { usageCount: { increment: 1 } },
          });
          
          if (updatedCoupon.usageLimit !== null && updatedCoupon.usageCount > updatedCoupon.usageLimit) {
            throw new Prisma.PrismaClientKnownRequestError("Usage limit exceeded in transaction", { code: "P2002", clientVersion: "latest" });
          }
        }

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
          data: { action: "ORDER_CREATED", entityType: "Order", entityId: created.id, metadata: { orderNumber: created.orderNumber, provider: input.paymentMethod, status: "PENDING" } },
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
            guestUrl: buildOrderGuestUrl({ orderNumber: created.orderNumber, lookupToken: created.lookupToken, userId: created.userId }),
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
            lookupToken: created.lookupToken,
            userId: created.userId,
            payments: [{ id: "", status: "PENDING", provider: input.paymentMethod === "ONLINE" ? getPaymentProvider().providerName : "COD" }], // We don't need the exact ID here for the summary
          },
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 15000 }
    );

    const provider = getPaymentProvider();
    
    const initOnlinePayment = async (orderSummary: OrderSummaryShape): Promise<OrderPlacementResult> => {
      const baseUrl = process.env.APP_URL || "http://localhost:3000";
      const paymentInit = await provider.initiatePayment({
        orderId: orderSummary.id,
        orderNumber: orderSummary.orderNumber,
        amount: orderSummary.grandTotal,
        currency: "USD",
        customerEmail: input.customer.email,
        customerName: input.customer.fullName,
        customerPhone: input.customer.phone,
        successUrl: `${baseUrl}/payment/return?tran_id=${orderSummary.orderNumber}&lookup_token=${orderSummary.lookupToken}`,
        failUrl: `${baseUrl}/payment/return?tran_id=${orderSummary.orderNumber}&lookup_token=${orderSummary.lookupToken}`,
        cancelUrl: `${baseUrl}/payment/return?tran_id=${orderSummary.orderNumber}&lookup_token=${orderSummary.lookupToken}`,
        ipnUrl: `${baseUrl}/api/webhooks/payments`,
      });

      if (!paymentInit.ok) {
        return { ok: false, code: "payment_init_failed", message: paymentInit.message };
      }
      
      const result = summarize(orderSummary);
      if (!result.ok) return result; // should never happen
      return { ...result, paymentRedirectUrl: paymentInit.redirectUrl };
    };

    if (outcome.kind === "replay") {
      const isOnline = outcome.order.payments?.[0]?.provider !== "COD";
      const isPending = outcome.order.payments?.[0]?.status === "PENDING";
      
      if (isOnline && isPending) {
        const result = await initOnlinePayment(outcome.order);
        if (result.ok) return { ...result, replayed: true };
        return result;
      }
      
      const result = summarize(outcome.order);
      return result.ok ? { ...result, replayed: true } : result;
    }
    if (outcome.kind === "invalid_shipping") return { ok: false, code: "invalid_shipping", message: "The selected shipping method is not available." };
    if (outcome.kind === "blocked") return { ok: false, code: "out_of_stock", message: "Some items are no longer available or are out of stock. Please review your cart.", failedVariantIds: outcome.failedVariantIds };
    
    if (input.paymentMethod === "ONLINE") {
      return initOnlinePayment(outcome.order);
    }
    
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
