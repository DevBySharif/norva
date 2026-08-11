import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient, ProductStatus, Role } from "@prisma/client";
import crypto from "node:crypto";
import {
  claimGuestOrderCore,
  createAddressCore,
  deleteAddressCore,
  registerCustomerCore,
  setDefaultAddressCore,
  updateAddressCore,
  updateProfileCore,
} from "./service";
import { getCustomerOrder, getCustomerOrders } from "./queries";
import { placeOrderCore } from "@/features/orders/service";

const prisma = new PrismaClient();
const runId = crypto.randomBytes(4).toString("hex");
const emailA = `svc-a-${runId}@example.test`;
const emailB = `svc-b-${runId}@example.test`;
const password = "SecurePass-4A";
const categorySlug = `svc-cat-${runId}`;
const productSlug = `svc-prod-${runId}`;
const productSku = `SVC-${runId}`;

let userAId = "";
let userBId = "";
let guestOrderId = "";
let guestOrderNumber = "";
let guestLookupToken = "";
const orderIds: string[] = [];

beforeAll(async () => {
  const regA = await registerCustomerCore({ fullName: "Service Alpha", email: emailA, password, confirmPassword: password });
  const regB = await registerCustomerCore({ fullName: "Service Bravo", email: emailB, password, confirmPassword: password });
  expect(regA.ok).toBe(true);
  expect(regB.ok).toBe(true);
  userAId = (await prisma.user.findUniqueOrThrow({ where: { email: emailA } })).id;
  userBId = (await prisma.user.findUniqueOrThrow({ where: { email: emailB } })).id;

  const cat = await prisma.category.create({
    data: {
      name: `Service Test ${runId}`,
      slug: categorySlug,
      isActive: true,
      products: {
        create: {
          name: "Service Product",
          slug: productSlug,
          sku: productSku,
          basePrice: 25,
          status: ProductStatus.ACTIVE,
          variants: { create: { name: "Default", sku: `${productSku}-V`, price: 25, inventory: { create: { quantity: 100, reorderPoint: 0 } } } },
        },
      },
    },
    include: { products: { include: { variants: true } } },
  });
  const variant = cat.products[0].variants[0];

  const placed = await placeOrderCore({
    items: [{ variantId: variant.id, quantity: 1 }],
    customer: { fullName: "Guest Shopper", email: `guest-${runId}@example.test`, phone: "+1 555 010 0000" },
    shippingAddress: { line1: "1 Guest Way", line2: "", city: "Guestville", state: "GS", postalCode: "00000", country: "Guestland" },
    shippingMethodCode: undefined,
    idempotencyKey: `guest-${runId}`,
  });
  expect(placed.ok).toBe(true);
  if (!placed.ok) throw new Error("guest order fixture failed");
  orderIds.push(placed.orderId);
  const guestOrder = await prisma.order.findUniqueOrThrow({ where: { id: placed.orderId } });
  guestOrderId = guestOrder.id;
  guestOrderNumber = guestOrder.orderNumber;
  guestLookupToken = guestOrder.lookupToken!;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: [userAId, userBId] } } });
  await prisma.auditLog.deleteMany({ where: { entityType: "Order", entityId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.address.deleteMany({ where: { userId: { in: [userAId, userBId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  await prisma.product.deleteMany({ where: { slug: productSlug } });
  await prisma.category.deleteMany({ where: { slug: categorySlug } });
  await prisma.$disconnect();
});

describe("customer registration", () => {
  it("always assigns CUSTOMER and stores only a bcrypt hash", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: emailA } });
    expect(user.role).toBe(Role.CUSTOMER);
    expect(user.passwordHash!.startsWith("$2")).toBe(true);
    expect(user.passwordHash).not.toBe(password);
    expect(user.passwordHash!.includes(password)).toBe(false);
  });

  it("rejects duplicate email with a friendly error", async () => {
    const dup = await registerCustomerCore({ fullName: "Dup", email: emailA, password, confirmPassword: password });
    expect(dup.ok).toBe(false);
    if (!dup.ok) {
      expect(dup.code).toBe("email_taken");
      expect(dup.message).toMatch(/already exists/i);
    }
    expect(await prisma.user.count({ where: { email: emailA } })).toBe(1);
  });
});

describe("profile ownership", () => {
  it("updates the session owner only and never another user", async () => {
    await updateProfileCore(userAId, { fullName: "Alpha Renamed", phone: "+1 555 010 1111" });
    const a = await prisma.user.findUniqueOrThrow({ where: { id: userAId } });
    const b = await prisma.user.findUniqueOrThrow({ where: { id: userBId } });
    expect(a.name).toBe("Alpha Renamed");
    expect(a.phone).toBe("+1 555 010 1111");
    expect(b.name).toBe("Service Bravo");
    expect(b.phone).toBeNull();
  });
});

describe("address ownership and single default", () => {
  it("first address becomes default; second default keeps exactly one default", async () => {
    await createAddressCore(userAId, { recipientName: "Alpha", line1: "10 Alpha Rd", city: "Alpha City", country: "United States", isDefault: false });
    const first = await prisma.address.findFirst({ where: { userId: userAId } });
    expect(first!.isDefault).toBe(true);

    await createAddressCore(userAId, { recipientName: "Beta", line1: "20 Beta Rd", city: "Beta City", country: "United States", isDefault: true });
    expect(await prisma.address.count({ where: { userId: userAId, isDefault: true } })).toBe(1);

    await createAddressCore(userAId, { recipientName: "Gamma", line1: "30 Gamma Rd", city: "Gamma City", country: "United States", isDefault: false });
    expect(await prisma.address.count({ where: { userId: userAId, isDefault: true } })).toBe(1);
  });

  it("customer B cannot read, edit, default, or delete customer A addresses", async () => {
    const aAddresses = await prisma.address.findMany({ where: { userId: userAId } });
    expect(aAddresses.length).toBeGreaterThan(0);
    const target = aAddresses[0]!;

    const edit = await updateAddressCore(userBId, target.id, { recipientName: "Hacked", line1: "999 Hacker Way", city: "Hacker City" });
    expect(edit.ok).toBe(false);

    const setDefault = await setDefaultAddressCore(userBId, target.id);
    expect(setDefault.ok).toBe(false);

    const del = await deleteAddressCore(userBId, target.id);
    expect(del.ok).toBe(false);

    const unchanged = await prisma.address.findUniqueOrThrow({ where: { id: target.id } });
    expect(unchanged.line1).toBe(target.line1);
    expect(await prisma.address.count({ where: { userId: userAId } })).toBe(aAddresses.length);

    const bAddresses = await prisma.address.findMany({ where: { userId: userBId } });
    expect(bAddresses.some((addr) => addr.id === target.id)).toBe(false);
  });

  it("deleting the default promotes a single replacement", async () => {
    const addresses = await prisma.address.findMany({ where: { userId: userAId }, orderBy: { createdAt: "asc" } });
    const currentDefault = addresses.find((a) => a.isDefault)!;
    const others = addresses.filter((a) => a.id !== currentDefault.id);
    expect(others.length).toBeGreaterThan(0);

    await deleteAddressCore(userAId, currentDefault.id);
    expect(await prisma.address.count({ where: { userId: userAId, isDefault: true } })).toBe(1);
  });
});

describe("guest order claim security", () => {
  it("fails with wrong proof and does not link", async () => {
    const fail = await claimGuestOrderCore(userAId, { orderNumber: guestOrderNumber, email: emailA, accessToken: "0".repeat(guestLookupToken.length) });
    expect(fail.ok).toBe(false);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: guestOrderId } });
    expect(order.userId).toBeNull();
  });

  it("links only when proof matches the guest email and token", async () => {
    const ok = await claimGuestOrderCore(userAId, { orderNumber: guestOrderNumber, email: `guest-${runId}@example.test`, accessToken: guestLookupToken });
    expect(ok.ok).toBe(true);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: guestOrderId } });
    expect(order.userId).toBe(userAId);
    const audit = await prisma.auditLog.findFirst({ where: { entityType: "Order", entityId: guestOrderId, action: "ORDER_CLAIMED" } });
    expect(audit).toBeTruthy();
  });

  it("another customer cannot re-claim an owned order", async () => {
    const fail = await claimGuestOrderCore(userBId, { orderNumber: guestOrderNumber, email: `guest-${runId}@example.test`, accessToken: guestLookupToken });
    expect(fail.ok).toBe(false);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: guestOrderId } });
    expect(order.userId).toBe(userAId);
  });
});

describe("customer order queries are privacy-safe", () => {
  it("only returns own orders", async () => {
    const placed = await prisma.order.create({
      data: {
        orderNumber: `SVC-OWN-${runId}`,
        email: emailA,
        status: "PENDING",
        subtotal: 10,
        shippingTotal: 0,
        taxTotal: 0,
        grandTotal: 10,
        currency: "USD",
        shippingAddress: { line1: "1", city: "C", state: "S", postalCode: "1", country: "X" },
        userId: userAId,
      },
    });
    orderIds.push(placed.id);

    const forA = await getCustomerOrders(userAId);
    const forB = await getCustomerOrders(userBId);
    expect(forA.some((o) => o.orderNumber === placed.orderNumber)).toBe(true);
    expect(forB.some((o) => o.orderNumber === placed.orderNumber)).toBe(false);
  });

  it("exposes only safe customer fields on the detail select", async () => {
    const detail = await getCustomerOrder(userAId, guestOrderNumber);
    expect(detail).toBeTruthy();
    const keys = Object.keys(detail!);
    expect(keys).not.toContain("lookupToken");
    expect(keys).not.toContain("userId");
    expect(detail!.statusHistory.every((h) => !("internalNote" in h))).toBe(true);
    expect(detail!.items.every((i) => !("costPrice" in i))).toBe(true);
  });
});
