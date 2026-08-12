import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db/prisma";
import { placeOrderCore } from "@/features/orders/service";
import { ProductStatus } from "@prisma/client";

describe("Phase 5A: Coupons and Shipping Rules", () => {
  let product: { id: string };
  let variant: { id: string };

  beforeEach(async () => {
    await prisma.couponUsage.deleteMany();
    await prisma.order.deleteMany();
    await prisma.coupon.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.storeSettings.deleteMany();
    await prisma.shippingMethod.deleteMany();

    await prisma.storeSettings.create({
      data: {
        id: "default",
        freeShippingThreshold: 100.00,
      }
    });

    await prisma.shippingMethod.create({
      data: {
        code: "standard_shipping",
        name: "Standard Shipping",
        price: 10.00,
        isActive: true,
      }
    });

    let category = await prisma.category.findFirst();
    if (!category) {
      category = await prisma.category.create({
        data: { name: "Test Category", slug: "test-category-" + Date.now() }
      });
    }

    product = await prisma.product.create({
      data: {
        name: "Test Product",
        slug: "test-product-" + Date.now(),
        description: "Test description",
        status: ProductStatus.ACTIVE,
        sku: "TEST-SKU-BASE",
        basePrice: 50.00,
        categoryId: category.id,
      },
    });

    variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        sku: "TEST-SKU-1",
        name: "Default",
        price: 50.00,
        isActive: true,
        inventory: { create: { quantity: 100 } }
      },
    });
  });

  const getBaseInput = (qty: number, couponCode?: string) => ({
    items: [{ variantId: variant.id, quantity: qty }],
    customer: { fullName: "Test", email: "test@test.com", phone: "1234567890" },
    shippingAddress: { line1: "123 Main St", city: "Test City", state: "NY", postalCode: "10001", country: "USA" },
    idempotencyKey: crypto.randomUUID(),
    paymentMethod: "COD" as const,
    couponCode
  });

  it("1. shipping below free threshold -> Standard Shipping fee", async () => {
    // subtotal = 50
    const res = await placeOrderCore(getBaseInput(1));
    expect(res.ok).toBe(true);
    if (res.ok) {
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: res.orderNumber } });
      expect(order.subtotal.toString()).toBe("50");
      expect(order.shippingTotal.toString()).toBe("10"); // Standard fee
      expect(order.grandTotal.toString()).toBe("60");
    }
  });

  it("2. subtotal exactly equal to threshold -> free shipping", async () => {
    // subtotal = 100
    const res = await placeOrderCore(getBaseInput(2));
    expect(res.ok).toBe(true);
    if (res.ok) {
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: res.orderNumber } });
      expect(order.subtotal.toString()).toBe("100");
      expect(order.shippingTotal.toString()).toBe("0"); // Free
      expect(order.grandTotal.toString()).toBe("100");
    }
  });

  it("3. coupon reduces total below threshold but shipping remains free (threshold uses pre-discount)", async () => {
    await prisma.coupon.create({ data: { code: "MINUS20", type: "FIXED_AMOUNT", value: 20 } });
    
    // subtotal = 100, free shipping applies before discount
    const res = await placeOrderCore(getBaseInput(2, "MINUS20"));
    expect(res.ok).toBe(true);
    if (res.ok) {
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: res.orderNumber } });
      expect(order.subtotal.toString()).toBe("100");
      expect(order.discountTotal.toString()).toBe("20");
      expect(order.shippingTotal.toString()).toBe("0"); 
      expect(order.grandTotal.toString()).toBe("80");
    }
  });

  it("4. admin changes Standard Shipping fee -> new checkouts use new fee", async () => {
    await prisma.shippingMethod.updateMany({ data: { price: 15.00 } });
    const res = await placeOrderCore(getBaseInput(1));
    if (res.ok) {
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: res.orderNumber } });
      expect(order.shippingTotal.toString()).toBe("15");
    }
  });

  it("5. percentage coupon", async () => {
    await prisma.coupon.create({ data: { code: "HALF", type: "PERCENTAGE", value: 50 } });
    const res = await placeOrderCore(getBaseInput(1, "HALF"));
    if (res.ok) {
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: res.orderNumber } });
      expect(order.subtotal.toString()).toBe("50");
      expect(order.discountTotal.toString()).toBe("25");
      expect(order.grandTotal.toString()).toBe("35"); // 50 - 25 + 10 shipping
    }
  });

  it("6. fixed coupon", async () => {
    await prisma.coupon.create({ data: { code: "TENOFF", type: "FIXED_AMOUNT", value: 10 } });
    const res = await placeOrderCore(getBaseInput(1, "TENOFF"));
    if (res.ok) {
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: res.orderNumber } });
      expect(order.discountTotal.toString()).toBe("10");
      expect(order.grandTotal.toString()).toBe("50"); // 50 - 10 + 10 shipping
    }
  });

  it("7. fixed coupon capped at subtotal", async () => {
    await prisma.coupon.create({ data: { code: "HUGE", type: "FIXED_AMOUNT", value: 100 } });
    const res = await placeOrderCore(getBaseInput(1, "HUGE"));
    if (res.ok) {
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: res.orderNumber } });
      expect(order.discountTotal.toString()).toBe("50"); // Subtotal is 50, capped
      expect(order.grandTotal.toString()).toBe("10"); // Shipping only
    }
  });

  it("8. expired coupon is ignored", async () => {
    await prisma.coupon.create({ data: { code: "EXPIRED", type: "PERCENTAGE", value: 50, expiresAt: new Date(Date.now() - 10000) } });
    const res = await placeOrderCore(getBaseInput(1, "EXPIRED"));
    if (res.ok) {
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: res.orderNumber } });
      expect(order.discountTotal.toString()).toBe("0"); // Not applied
    }
  });

  it("9. inactive coupon is ignored", async () => {
    await prisma.coupon.create({ data: { code: "INACTIVE", type: "PERCENTAGE", value: 50, isActive: false } });
    const res = await placeOrderCore(getBaseInput(1, "INACTIVE"));
    if (res.ok) {
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: res.orderNumber } });
      expect(order.discountTotal.toString()).toBe("0");
    }
  });

  it("10. minimum subtotal", async () => {
    await prisma.coupon.create({ data: { code: "MIN100", type: "FIXED_AMOUNT", value: 10, minimumSubtotal: 100 } });
    const res1 = await placeOrderCore(getBaseInput(1, "MIN100")); // subtotal 50
    if (res1.ok) {
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: res1.orderNumber } });
      expect(order.discountTotal.toString()).toBe("0"); // Not met
    }
    const res2 = await placeOrderCore(getBaseInput(2, "MIN100")); // subtotal 100
    if (res2.ok) {
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: res2.orderNumber } });
      expect(order.discountTotal.toString()).toBe("10"); // Met
    }
  });

  it("11. usage limit", async () => {
    await prisma.coupon.create({ data: { code: "ONCE", type: "FIXED_AMOUNT", value: 10, usageLimit: 1 } });
    const res1 = await placeOrderCore(getBaseInput(1, "ONCE"));
    expect(res1.ok).toBe(true);
    const res2 = await placeOrderCore({ ...getBaseInput(1, "ONCE"), idempotencyKey: "newkey" });
    if (res2.ok) {
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: res2.orderNumber } });
      expect(order.discountTotal.toString()).toBe("0"); // Already used
    }
  });

  it("12. usageLimit=1 concurrent checkout", async () => {
    await prisma.coupon.create({ data: { code: "RACE", type: "FIXED_AMOUNT", value: 10, usageLimit: 1 } });
    const p1 = placeOrderCore(getBaseInput(1, "RACE"));
    const p2 = placeOrderCore({ ...getBaseInput(1, "RACE"), idempotencyKey: "key2" });
    await Promise.all([p1, p2]);
    const coupon = await prisma.coupon.findUnique({ where: { code: "RACE" } });
    expect(coupon?.usageCount).toBeLessThanOrEqual(1);
  });

  it("13. failed checkout does not increment usage", async () => {
    await prisma.coupon.create({ data: { code: "FAIL", type: "FIXED_AMOUNT", value: 10, usageLimit: 1 } });
    // Try to buy 1000 items (out of stock)
    const res = await placeOrderCore(getBaseInput(1000, "FAIL"));
    expect(res.ok).toBe(false);
    
    const coupon = await prisma.coupon.findUnique({ where: { code: "FAIL" } });
    expect(coupon?.usageCount).toBe(0);
  });

  it("14. checkout idempotency replay does not increment usage twice", async () => {
    await prisma.coupon.create({ data: { code: "REPLAY", type: "FIXED_AMOUNT", value: 10 } });
    const input = getBaseInput(1, "REPLAY");
    await placeOrderCore(input);
    const res = await placeOrderCore(input); // exact same key
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.replayed).toBe(true);
    }
    const coupon = await prisma.coupon.findUnique({ where: { code: "REPLAY" } });
    expect(coupon?.usageCount).toBe(1);
  });

  it("16. ONLINE Payment amount equals final persisted Order grandTotal", async () => {
    await prisma.coupon.create({ data: { code: "PAY10", type: "FIXED_AMOUNT", value: 10 } });
    const input = { ...getBaseInput(1, "PAY10"), paymentMethod: "ONLINE" as const };
    const res = await placeOrderCore(input);
    if (res.ok) {
      const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: res.orderNumber } });
      const payment = await prisma.payment.findFirst({ where: { orderId: order.id } });
      expect(payment?.amount.toString()).toBe("50"); // 50 - 10 + 10 shipping
      expect(order.grandTotal.toString()).toBe("50");
    }
  });

});
