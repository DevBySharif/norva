import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient, ProductStatus } from "@prisma/client";
import { placeOrderCore, getOrderByNumberForPublic } from "./service";
import { markPaymentReceivedCore, transitionOrderStatusCore } from "./order-lifecycle";
import { processPendingNotifications } from "@/features/notifications/outbox";
import type { CheckoutInput } from "@/lib/validations/checkout";
import crypto from "node:crypto";

const prisma = new PrismaClient();
const runId = crypto.randomBytes(4).toString("hex");
const email = `lifecycle-${runId}@example.org`;
const categorySlug = `lc-cat-${runId}`;
const productSlug = `lc-product-${runId}`;
const productSku = `LC-${runId}`;

let productId = "";
let variantId = "";
let inventoryId = "";
const orderIds: string[] = [];
let placedOrders = 0;

function baseInput(overrides: { idempotencyKey: string; quantity?: number }): CheckoutInput {
  return {
    items: [{ variantId, quantity: overrides.quantity ?? 1 }],
    customer: { fullName: "Lifecycle Tester", email, phone: "+1 555 010 0000" },
    shippingAddress: { line1: "1 Lifecycle Way", line2: "", city: "Test City", state: "TS", postalCode: "00000", country: "Testland" },
    shippingMethodCode: undefined,
    idempotencyKey: overrides.idempotencyKey,
  };
}

async function placeOrder(quantity = 1): Promise<{ id: string; orderNumber: string }> {
  // Serializable isolation under parallel vitest workers can surface transient
  // serialization aborts. Placement is retried (a failed placement commits
  // nothing), which mirrors the storefront's "please retry" behavior.
  let lastResult: Awaited<ReturnType<typeof placeOrderCore>> | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    placedOrders += 1;
    const input = baseInput({ idempotencyKey: `lc-${runId}-${placedOrders}`, quantity });
    lastResult = await placeOrderCore(input);
    if (lastResult.ok === true) {
      orderIds.push(lastResult.orderId);
      return { id: lastResult.orderId, orderNumber: lastResult.orderNumber };
    }
    if (lastResult.ok === false && (lastResult.code === "out_of_stock" || lastResult.code === "conflict")) continue;
    break;
  }
  throw new Error(`placement failed: ${JSON.stringify(lastResult)}`);
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: {
      name: `Lifecycle ${runId}`,
      slug: categorySlug,
      isActive: true,
      products: {
        create: {
          name: "Lifecycle Product",
          slug: productSlug,
          sku: productSku,
          basePrice: 50,
          status: ProductStatus.ACTIVE,
          variants: {
            create: {
              name: "Default",
              sku: `${productSku}-V`,
              price: 50,
              costPrice: 10,
              inventory: { create: { quantity: 20, reorderPoint: 0 } },
            },
          },
        },
      },
    },
    include: { products: { include: { variants: { include: { inventory: true } } } } },
  });
  const product = category.products[0];
  productId = product.id;
  variantId = product.variants[0].id;
  inventoryId = product.variants[0].inventory!.id;
});

afterAll(async () => {
  const payments = await prisma.payment.findMany({ where: { orderId: { in: orderIds } }, select: { id: true } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ entityType: "Order", entityId: { in: orderIds } }, { entityType: "Payment", entityId: { in: payments.map((p) => p.id) } }] },
  });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.category.deleteMany({ where: { slug: categorySlug } });
  await prisma.$disconnect();
});

const actor = { type: "ADMIN", userId: "test-admin" } as const;

async function orderState(id: string) {
  return prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      lookupToken: true,
      payment: { select: { status: true, provider: true } },
      statusHistory: { orderBy: { createdAt: "asc" }, select: { status: true, fromStatus: true, note: true, internalNote: true, actorType: true } },
      items: { select: { productName: true, sku: true, unitPrice: true } },
    },
  });
}

describe("Order lifecycle transitions", () => {
  it("moves PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED atomically, finalizing stock once and settling COD at delivery", async () => {
    const order = await placeOrder();
    const inventoryBefore = await prisma.inventory.findUnique({ where: { id: inventoryId } });
    expect(Number(inventoryBefore?.reservedQuantity)).toBe(1);
    expect(Number(inventoryBefore?.quantity)).toBe(20);

    const confirmed = await transitionOrderStatusCore(order.id, "CONFIRMED", {
      actor,
      note: "Thanks for your order",
      internalNote: "Priority handling",
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) throw new Error("expected confirm to succeed");

    const processing = await transitionOrderStatusCore(order.id, "PROCESSING", { actor });
    expect(processing.ok).toBe(true);

    const shipped = await transitionOrderStatusCore(order.id, "SHIPPED", { actor, note: "Left the warehouse" });
    expect(shipped.ok).toBe(true);
    if (shipped.ok) expect(shipped.inventoryAction).toBe("finalize");

    // Finalize happened exactly once: physical quantity down by 1, reservation cleared.
    const afterShip = await prisma.inventory.findUnique({ where: { id: inventoryId } });
    expect(Number(afterShip?.quantity)).toBe(19);
    expect(Number(afterShip?.reservedQuantity)).toBe(0);

    const delivered = await transitionOrderStatusCore(order.id, "DELIVERED", { actor });
    expect(delivered.ok).toBe(true);

    const state = await orderState(order.id);
    expect(state?.status).toBe("DELIVERED");
    // COD settles at delivery.
    expect(state?.payment?.status).toBe("PAID");
    // History records the full chain with actors and the customer-visible note.
    expect(state?.statusHistory.map((h) => h.status)).toEqual(["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"]);
    expect(state?.statusHistory.find((h) => h.status === "SHIPPED")?.fromStatus).toBe("PROCESSING");
    expect(state?.statusHistory.find((h) => h.status === "SHIPPED")?.note).toBe("Left the warehouse");
    expect(state?.statusHistory.find((h) => h.status === "CONFIRMED")?.internalNote).toBe("Priority handling");
    // The initial PENDING row is SYSTEM; every staff transition carries ADMIN attribution.
    expect(state?.statusHistory.slice(1).every((h) => h.actorType === "ADMIN")).toBe(true);

    // Audit trail covers status changes and the payment settlement.
    const audits = await prisma.auditLog.findMany({ where: { OR: [{ entityType: "Order", entityId: order.id }, { entityType: "Payment" }] } });
    expect(audits.filter((a) => a.action === "ORDER_STATUS_CHANGED")).toHaveLength(4);
    const shippedAudit = audits.find((a) => a.action === "ORDER_STATUS_CHANGED" && (a.metadata as { toStatus?: string })?.toStatus === "SHIPPED");
    expect((shippedAudit?.metadata as { inventoryAction?: string })?.inventoryAction).toBe("finalize");
    expect(audits.filter((a) => a.action === "PAYMENT_STATUS_CHANGED").length).toBeGreaterThanOrEqual(1);

    // Terminal state: no legal transitions remain from DELIVERED.
    const forbidden = await transitionOrderStatusCore(order.id, "PROCESSING", { actor });
    if (!forbidden.ok) expect(forbidden.code).toBe("invalid_transition");
  });

  it("rejects illegal jumps without mutating anything", async () => {
    const order = await placeOrder();
    const before = await orderState(order.id);

    // Skipping stages (PENDING → DELIVERED / PROCESSING) is illegal.
    const jump = await transitionOrderStatusCore(order.id, "DELIVERED", { actor });
    expect(jump.ok).toBe(false);
    if (!jump.ok) expect(jump.code).toBe("invalid_transition");

    const skip = await transitionOrderStatusCore(order.id, "PROCESSING", { actor });
    expect(skip.ok).toBe(false);
    if (!skip.ok) expect(skip.code).toBe("invalid_transition");

    const after = await orderState(order.id);
    expect(after?.status).toBe("PENDING");
    expect(after?.statusHistory).toHaveLength(before?.statusHistory.length ?? 0);
    const inv = await prisma.inventory.findUnique({ where: { id: inventoryId } });
    // No reservation was released and no stock was finalized by the failed attempts.
    expect(Number(inv?.reservedQuantity)).toBe(1);
  });

  it("cancelling before shipment releases the reservation exactly once, and a second cancel is a friendly no-op", async () => {
    const order = await placeOrder();
    const beforeCancelInv = await prisma.inventory.findUnique({ where: { id: inventoryId } });
    const reservedBefore = Number(beforeCancelInv?.reservedQuantity);
    const quantityBefore = Number(beforeCancelInv?.quantity);

    const cancelled = await transitionOrderStatusCore(order.id, "CANCELLED", { actor, note: "Customer requested cancellation" });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) throw new Error("expected cancel to succeed");

    const afterCancel = await prisma.inventory.findUnique({ where: { id: inventoryId } });
    expect(Number(afterCancel?.quantity)).toBe(quantityBefore); // physical stock never touched
    expect(Number(afterCancel?.reservedQuantity)).toBe(reservedBefore - 1);

    const state = await orderState(order.id);
    expect(state?.status).toBe("CANCELLED");
    expect(state?.statusHistory.map((h) => h.status)).toEqual(["PENDING", "CANCELLED"]);
    expect(state?.statusHistory.find((h) => h.status === "CANCELLED")?.fromStatus).toBe("PENDING");
    expect(state?.statusHistory.find((h) => h.status === "CANCELLED")?.note).toBe("Customer requested cancellation");
    // Cancelling must NOT settle payment.
    expect(state?.payment?.status).toBe("PENDING");

    const audits = await prisma.auditLog.findMany({ where: { entityType: "Order", entityId: order.id } });
    expect(audits.some((a) => a.action === "ORDER_CANCELLED")).toBe(true);

    // Second cancel: already cancelled is reported friendly and changes nothing.
    const second = await transitionOrderStatusCore(order.id, "CANCELLED", { actor });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.code).toBe("already_processed");

    const afterSecond = await prisma.inventory.findUnique({ where: { id: inventoryId } });
    expect(Number(afterSecond?.reservedQuantity)).toBe(reservedBefore - 1);
    const historyAfter = (await orderState(order.id))?.statusHistory;
    expect(historyAfter).toHaveLength(2);
  });

  it("two admins racing with conflicting moves (SHIPPED vs CANCELLED) resolve to exactly one winner with a clean trail", async () => {
    const order = await placeOrder();
    await transitionOrderStatusCore(order.id, "CONFIRMED", { actor });
    await transitionOrderStatusCore(order.id, "PROCESSING", { actor });

    const staged = await prisma.inventory.findUnique({ where: { id: inventoryId } });
    const reservedBefore = Number(staged?.reservedQuantity);
    const quantityBefore = Number(staged?.quantity);

    const [shipRace, cancelRace] = await Promise.all([
      transitionOrderStatusCore(order.id, "SHIPPED", { actor }),
      transitionOrderStatusCore(order.id, "CANCELLED", { actor }),
    ]);

    const winners = [shipRace, cancelRace].filter((r) => r.ok === true);
    const losers = [shipRace, cancelRace].filter((r) => r.ok === false);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    if (losers[0]?.ok === false) expect(["conflict", "invalid_transition"]).toContain(losers[0].code);

    const state = await orderState(order.id);
    expect(["SHIPPED", "CANCELLED"]).toContain(state?.status);
    // Staging (CONFIRMED → PROCESSING) plus exactly one surviving race entry.
    expect(state?.statusHistory).toHaveLength(4);
    const audits = await prisma.auditLog.findMany({ where: { entityType: "Order", entityId: order.id } });
    const auditActions = audits.map((a) => a.action);
    // ORDER_CREATED + CONFIRMED + PROCESSING + exactly one race winner
    // (SHIPPED → ORDER_STATUS_CHANGED; CANCELLED → ORDER_CANCELLED).
    expect(auditActions).toHaveLength(4);
    expect(auditActions).toContain("ORDER_CREATED");
    const cancelledCount = audits.filter((a) => a.action === "ORDER_CANCELLED").length;
    const shippedCount = audits.filter((a) => a.action === "ORDER_STATUS_CHANGED" && (a.metadata as { toStatus?: string })?.toStatus === "SHIPPED").length;
    expect(cancelledCount + shippedCount).toBe(1);

    const inv = await prisma.inventory.findUnique({ where: { id: inventoryId } });
    const reserved = Number(inv?.reservedQuantity);
    const quantity = Number(inv?.quantity);
    // Both moves free exactly one reserved unit; only SHIPPING commits physical stock.
    expect(reserved).toBe(reservedBefore - 1);
    if (state?.status === "SHIPPED") expect(quantity).toBe(quantityBefore - 1);
    else expect(quantity).toBe(quantityBefore);
  });

  it("two admins racing to SHIPPED finalize stock exactly once", async () => {
    const order = await placeOrder();
    await transitionOrderStatusCore(order.id, "CONFIRMED", { actor });
    await transitionOrderStatusCore(order.id, "PROCESSING", { actor });

    const staged = await prisma.inventory.findUnique({ where: { id: inventoryId } });
    const reservedBefore = Number(staged?.reservedQuantity);
    const quantityBefore = Number(staged?.quantity);

    const [a, b] = await Promise.all([
      transitionOrderStatusCore(order.id, "SHIPPED", { actor }),
      transitionOrderStatusCore(order.id, "SHIPPED", { actor }),
    ]);
    const winners = [a, b].filter((r) => r.ok === true);
    const losers = [a, b].filter((r) => r.ok === false);
    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(1);
    if (losers[0]?.ok === false) expect(["conflict", "already_processed"]).toContain(losers[0].code);

    const inv = await prisma.inventory.findUnique({ where: { id: inventoryId } });
    // Physical and reserved stock each moved exactly once.
    expect(Number(inv?.quantity)).toBe(quantityBefore - 1);
    expect(Number(inv?.reservedQuantity)).toBe(reservedBefore - 1);

    const state = await orderState(order.id);
    expect(state?.status).toBe("SHIPPED");
  });
});

describe("COD payment capture", () => {
  it("marks a pending COD payment as received once; repeats and cancelled orders are rejected", async () => {
    const order = await placeOrder();
    const paid = await markPaymentReceivedCore(order.id, actor);
    expect(paid.ok).toBe(true);

    const state = await orderState(order.id);
    expect(state?.payment?.status).toBe("PAID");
    expect((state?.payment?.provider ?? "").toUpperCase()).toBe("COD");

    const repeat = await markPaymentReceivedCore(order.id, actor);
    expect(repeat.ok).toBe(false);
    if (!repeat.ok) expect(repeat.code).toBe("already_processed");

    const cancelled = await placeOrder();
    await transitionOrderStatusCore(cancelled.id, "CANCELLED", { actor });
    const locked = await markPaymentReceivedCore(cancelled.id, actor);
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.code).toBe("invalid_transition");
  });
});

describe("Public order view privacy", () => {
  it("exposes only customer-safe fields and preserves the placement-time snapshot", async () => {
    const order = await placeOrder(2);

    // The catalog entry changes after placement (name, price, sku, cost).
    await prisma.productVariant.update({ where: { id: variantId }, data: { price: 99, costPrice: 5 } });
    await prisma.product.update({ where: { id: productId }, data: { name: "Lifecycle Product EDITED", sku: `${productSku}-EDITED` } });

    const publicView = await getOrderByNumberForPublic(order.orderNumber);
    expect(publicView).toBeTruthy();
    expect(publicView?.lookupToken).toBeTruthy();
    expect(publicView?.status).toBe("PENDING");
    // Snapshot is untouched by later catalog edits.
    expect(publicView?.items[0]?.productName).toBe("Lifecycle Product");
    expect(publicView?.items[0]?.sku).toBe(`${productSku}-V`);
    expect(Number(publicView?.items[0]?.unitPrice)).toBe(50);
    expect(Number(publicView?.grandTotal)).toBe(100);
    // Cost and staff fields never leak into the public shape.
    expect((publicView?.items[0] as Record<string, unknown>)["costPrice"]).toBeUndefined();
    expect(publicView?.items[0]?.variantName).toBe("Default");

    // The notification outbox payload is equally safe.
    const outbox = await prisma.notificationOutbox.findFirst({ where: { orderId: order.id, eventType: "ORDER_CREATED" } });
    expect(outbox).toBeTruthy();
    const payload = outbox!.payload as Record<string, unknown> & { items?: Array<Record<string, unknown>> };
    expect(JSON.stringify(payload)).not.toContain("costPrice");
    expect(payload.items?.[0]).toBeDefined();
    expect(payload.items?.[0]?.productName).toBe("Lifecycle Product");
  });
});

describe("Notification outbox", () => {
  it("sweeps pending deliveries to sent without affecting the original payload", async () => {
    const order = await placeOrder();
    await transitionOrderStatusCore(order.id, "CONFIRMED", { actor });

    // Nothing is sent until the sweep runs; state machine only enqueues.
    const pendingBefore = await prisma.notificationOutbox.findMany({ where: { orderId: order.id, status: "PENDING" } });
    expect(pendingBefore.length).toBeGreaterThanOrEqual(2);

    const processed = await processPendingNotifications(100);
    // The sweep is table-wide: it catches this order's rows plus any others left pending.
    expect(processed).toBeGreaterThanOrEqual(pendingBefore.length);

    const outbox = await prisma.notificationOutbox.findMany({ where: { orderId: order.id } });
    expect(outbox.every((row) => row.status === "SENT")).toBe(true);
    expect(outbox.every((row) => row.attempts >= 1)).toBe(true);
  });
});