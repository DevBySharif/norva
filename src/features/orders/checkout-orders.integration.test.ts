import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient, ProductStatus } from "@prisma/client";
import { placeOrderCore } from "./service";
import type { CheckoutInput } from "@/lib/validations/checkout";
import crypto from "node:crypto";

const prisma = new PrismaClient();
const runId = crypto.randomBytes(4).toString("hex");
const email = `checkout-${runId}@example.test`;
const categorySlug = `ck-cat-${runId}`;
const productSlug = `ck-product-${runId}`;
const productSku = `CK-${runId}`;

let productId = "";
let variantId = "";
let inventoryId = "";
const orderIds: string[] = [];

function baseInput(overrides: { idempotencyKey: string; quantity?: number }): CheckoutInput {
  return {
    items: [{ variantId, quantity: overrides.quantity ?? 1 }],
    customer: { fullName: "Concurrency Tester", email, phone: "+1 555 010 0000" },
    shippingAddress: { line1: "1 Concurrent Way", line2: "", city: "Test City", state: "TS", postalCode: "00000", country: "Testland" },
    paymentMethod: "COD",
    shippingMethodCode: undefined,
    idempotencyKey: overrides.idempotencyKey,
  };
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: {
      name: `Checkout Concurrency ${runId}`,
      slug: categorySlug,
      isActive: true,
      products: {
        create: {
          name: "Concurrency Product",
          slug: productSlug,
          sku: productSku,
          basePrice: 50,
          status: ProductStatus.ACTIVE,
          variants: {
            create: {
              name: "Default",
              sku: `${productSku}-V`,
              price: 50,
              inventory: { create: { quantity: 1, reorderPoint: 0 } },
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
  await prisma.auditLog.deleteMany({ where: { entityType: "Order", entityId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.product.deleteMany({ where: { id: productId } });
  await prisma.category.deleteMany({ where: { slug: categorySlug } });
  await prisma.$disconnect();
});

describe("Order placement concurrency", () => {
  it("two concurrent placements for one unit of stock: exactly one succeeds", async () => {
    const [a, b] = await Promise.allSettled([
      placeOrderCore(baseInput({ idempotencyKey: `a-${runId}` })),
      placeOrderCore(baseInput({ idempotencyKey: `b-${runId}` })),
    ]);

    const results = [a, b].map((r) => (r.status === "fulfilled" ? r.value : null));
    const successes = results.filter((r) => r?.ok === true);
    const failures = results.filter((r) => r && !r.ok);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (failures[0] && failures[0].ok === false) {
      expect(["out_of_stock", "conflict"]).toContain(failures[0].code);
    }

    const winner = successes[0];
    if (winner?.ok) {
      orderIds.push(winner.orderId);
      const order = await prisma.order.findUnique({
        where: { id: winner.orderId },
        select: { subtotal: true, shippingTotal: true, grandTotal: true, status: true, items: { select: { sku: true, quantity: true, unitPrice: true, lineTotal: true } } },
      });
      expect(order).toBeTruthy();
      expect(Number(order?.subtotal)).toBe(50);
      const shipping = Number(order?.shippingTotal);
      expect(shipping).toBeGreaterThanOrEqual(0);
      expect(Number(order?.grandTotal)).toBe(50 + shipping);
      expect(order?.status).toBe("PENDING");
      expect(order?.items).toHaveLength(1);
      expect(order?.items[0]?.quantity).toBe(1);
      expect(Number(order?.items[0]?.unitPrice)).toBe(50);
    }

    // Exactly one order landed and exactly one unit reserved.
    expect(await prisma.order.count({ where: { id: { in: orderIds } } })).toBe(1);
    const inventory = await prisma.inventory.findUnique({ where: { id: inventoryId } });
    expect(Number(inventory?.reservedQuantity)).toBe(1);
    expect(Number(inventory?.quantity)).toBe(1);
  });

  it("one successful order leaves a single order row and audit trail", async () => {
    const orders = await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, idempotencyKey: true } });
    expect(orders).toHaveLength(1);
    expect(orders[0]?.idempotencyKey).toMatch(new RegExp(`^(a|b)-${runId}$`));

    if (orders[0]) {
      const audit = await prisma.auditLog.findMany({ where: { entityType: "Order", entityId: orders[0].id } });
      expect(audit.some((a) => a.action === "ORDER_CREATED")).toBe(true);
    }
  });
});

describe("Order placement idempotency", () => {
  it("same idempotency key submitted twice creates exactly one order and replays it", async () => {
    // Give the fixture fresh capacity so this scenario is independent of the concurrency test.
    await prisma.inventory.update({ where: { id: inventoryId }, data: { quantity: 10, reservedQuantity: 1 } });

    const input = baseInput({ idempotencyKey: `replay-${runId}`, quantity: 2 });

    const first = await placeOrderCore(input);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("expected first submission to succeed");
    orderIds.push(first.orderId);

    const second = await placeOrderCore(input);
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("expected replay submission to succeed");
    expect(second.replayed).toBe(true);
    expect(second.orderNumber).toBe(first.orderNumber);
    expect(second.orderId).toBe(first.orderId);

    // One order, one reservation increment (never double-reserved by replay).
    expect(await prisma.order.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(1);
    const inventory = await prisma.inventory.findUnique({ where: { id: inventoryId } });
    expect(Number(inventory?.reservedQuantity)).toBe(3);

    const order = await prisma.order.findUnique({ where: { id: first.orderId }, include: { items: true, payments: { orderBy: { createdAt: "desc" }, take: 1 } } });
    expect(order?.items).toHaveLength(1);
    expect(order?.items[0]?.quantity).toBe(2);
    expect(Number(order?.items[0]?.unitPrice)).toBe(50);
    expect(Number(order?.items[0]?.lineTotal)).toBe(100);
    expect(Number(order?.subtotal)).toBe(100);
    const shipping = Number(order?.shippingTotal);
    expect(Number(order?.grandTotal)).toBe(100 + shipping);
    expect(order?.payments?.[0]?.provider).toBe("COD");
  });
});