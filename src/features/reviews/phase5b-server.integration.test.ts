import crypto from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient, ProductStatus, Role } from "@prisma/client";

let customerId: string | null = null;
let adminAllowed = false;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCustomer: vi.fn(async () => {
    if (!customerId) throw new Error("AUTH_REQUIRED");
    return { id: customerId, role: "CUSTOMER" };
  }),
  requireAdminUser: vi.fn(async () => {
    if (!adminAllowed) throw new Error("FORBIDDEN");
    return { id: "phase5b-admin", role: "SUPER_ADMIN" };
  }),
}));

import { toggleWishlist } from "@/features/wishlist/actions";
import { getWishlistProducts, isProductWishlisted } from "@/features/wishlist/queries";
import { deleteReview, saveReview, setReviewPublication } from "@/features/reviews/actions";
import { canReviewProduct, getProductReviews } from "@/features/reviews/queries";

const prisma = new PrismaClient();
const marker = `phase5b-c1-${crypto.randomBytes(5).toString("hex")}`;
const emails = [0, 1, 2].map((index) => `${marker}-${index}@example.test`);
const productSlugs = ["active", "draft", "archived", "deleted"].map((kind) => `${marker}-${kind}`);
let users: Array<{ id: string }> = [];
let products: Array<{ id: string; variants: Array<{ id: string }> }> = [];
let categoryId = "";
const orderIds: string[] = [];

async function createOrder(userId: string, productIndex: number, status: "PENDING" | "CANCELLED" | "DELIVERED") {
  const product = products[productIndex];
  const order = await prisma.order.create({ data: {
    orderNumber: `${marker}-${status}-${orderIds.length}`, email: emails[0], userId, status,
    subtotal: 10, grandTotal: 10, shippingTotal: 0, taxTotal: 0,
    shippingAddress: { line1: "1 Test St", city: "Test", country: "BD" },
    items: { create: { productId: product.id, variantId: product.variants[0].id, productName: productSlugs[productIndex], sku: `${marker}-${productIndex}`, unitPrice: 10, quantity: 1, lineTotal: 10 } },
  } });
  orderIds.push(order.id);
  return order;
}

beforeAll(async () => {
  users = await Promise.all(emails.map((email, index) => prisma.user.create({ data: { email, name: `C1 Customer ${index}`, role: Role.CUSTOMER } })));
  const category = await prisma.category.create({ data: { name: marker, slug: marker } });
  categoryId = category.id;
  const statuses = [ProductStatus.ACTIVE, ProductStatus.DRAFT, ProductStatus.ARCHIVED, ProductStatus.ACTIVE];
  products = await Promise.all(productSlugs.map((slug, index) => prisma.product.create({
    data: { name: slug, slug, sku: `${marker}-p-${index}`, basePrice: 10, categoryId, status: statuses[index], deletedAt: index === 3 ? new Date() : null,
      variants: { create: { name: "Default", sku: `${marker}-v-${index}`, price: 10, inventory: { create: { quantity: 20 } } } } },
    include: { variants: true },
  })));
});

beforeEach(() => { customerId = users[0]?.id ?? null; adminAllowed = false; });

afterAll(async () => {
  await prisma.review.deleteMany({ where: { user: { email: { startsWith: marker } } } });
  await prisma.wishlistItem.deleteMany({ where: { wishlist: { user: { email: { startsWith: marker } } } } });
  await prisma.wishlist.deleteMany({ where: { user: { email: { startsWith: marker } } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: marker } } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: marker } } });
  expect(await prisma.user.count({ where: { email: { startsWith: marker } } })).toBe(0);
  expect(await prisma.wishlistItem.count({ where: { wishlist: { user: { email: { startsWith: marker } } } } })).toBe(0);
  expect(await prisma.review.count({ where: { user: { email: { startsWith: marker } } } })).toBe(0);
  expect(await prisma.order.count({ where: { orderNumber: { startsWith: marker } } })).toBe(0);
  expect(await prisma.product.count({ where: { slug: { startsWith: marker } } })).toBe(0);
  await prisma.$disconnect();
});

describe("wishlist server security", () => {
  it("adds an ACTIVE product and the database prevents duplicate logical rows", async () => {
    expect(await toggleWishlist(products[0].id)).toMatchObject({ success: true, saved: true });
    const wishlist = await prisma.wishlist.findUniqueOrThrow({ where: { userId: users[0].id } });
    await expect(prisma.wishlistItem.create({ data: { wishlistId: wishlist.id, productId: products[0].id } })).rejects.toMatchObject({ code: "P2002" });
    expect(await prisma.wishlistItem.count({ where: { wishlistId: wishlist.id, productId: products[0].id } })).toBe(1);
    expect(await isProductWishlisted(users[0].id, products[0].id)).toBe(true);
    expect((await getWishlistProducts(users[0].id)).map((item) => item.product.id)).toContain(products[0].id);
  });

  it("customer B cannot remove customer A's item, while the owner can", async () => {
    customerId = users[1].id;
    expect(await toggleWishlist(products[0].id)).toMatchObject({ success: true, saved: true });
    expect(await isProductWishlisted(users[0].id, products[0].id)).toBe(true);
    customerId = users[0].id;
    expect(await toggleWishlist(products[0].id)).toMatchObject({ success: true, saved: false });
    expect(await isProductWishlisted(users[0].id, products[0].id)).toBe(false);
    expect(await isProductWishlisted(users[1].id, products[0].id)).toBe(true);
  });

  it("rejects anonymous mutation and safely rejects/filters non-public products", async () => {
    customerId = null;
    await expect(toggleWishlist(products[0].id)).rejects.toThrow("AUTH_REQUIRED");
    customerId = users[0].id;
    for (const product of products.slice(1)) expect(await toggleWishlist(product.id)).toMatchObject({ success: false });
    expect(await getWishlistProducts(users[0].id)).toEqual([]);
  });
});

describe("review eligibility, ownership, moderation, and privacy", () => {
  it("rejects no purchase, PENDING, and CANCELLED; accepts DELIVERED", async () => {
    const input = { productId: products[0].id, rating: 5, body: "A genuinely useful product." };
    expect(await saveReview(input)).toMatchObject({ success: false });
    await createOrder(users[0].id, 0, "PENDING");
    expect(await saveReview(input)).toMatchObject({ success: false });
    await createOrder(users[0].id, 0, "CANCELLED");
    expect(await saveReview(input)).toMatchObject({ success: false });
    await createOrder(users[0].id, 0, "DELIVERED");
    expect(await canReviewProduct(products[0].id, users[0].id)).toBe(true);
    expect(await saveReview(input)).toMatchObject({ success: true });
  });

  it("upserts one review, preserves ownership, and allows only owner deletion", async () => {
    expect(await saveReview({ productId: products[0].id, rating: 4, title: "Edited", body: "Updated owner review body." })).toMatchObject({ success: true });
    expect(await prisma.review.count({ where: { productId: products[0].id, userId: users[0].id } })).toBe(1);
    customerId = users[1].id;
    expect(await saveReview({ productId: products[0].id, rating: 1, body: "Attempted hostile overwrite." })).toMatchObject({ success: false });
    expect(await deleteReview(products[0].id)).toMatchObject({ success: false });
    const unchanged = await prisma.review.findUniqueOrThrow({ where: { productId_userId: { productId: products[0].id, userId: users[0].id } } });
    expect(unchanged.rating).toBe(4);
    customerId = users[0].id;
    expect(await deleteReview(products[0].id)).toMatchObject({ success: true });
  });

  it("enforces moderation authorization and returns a privacy-safe public shape", async () => {
    await saveReview({ productId: products[0].id, rating: 5, title: "Public", body: "Public approved review body." });
    const review = await prisma.review.findUniqueOrThrow({ where: { productId_userId: { productId: products[0].id, userId: users[0].id } } });
    await expect(setReviewPublication(review.id, false)).rejects.toThrow("FORBIDDEN");
    adminAllowed = true;
    await setReviewPublication(review.id, false);
    expect((await getProductReviews(products[0].id)).count).toBe(0);
    await setReviewPublication(review.id, true);
    const publicResult = await getProductReviews(products[0].id);
    expect(publicResult.count).toBe(1);
    const serialized = JSON.stringify(publicResult);
    for (const privateKey of ["email", "userId", "orderId", "auditLog", "internalNote", "metadata"]) expect(serialized).not.toContain(privateKey);
    expect(publicResult.reviews[0].user).toEqual({ name: "C1 Customer 0" });
  });

  it("aggregates only public ratings and retains delivered-purchase verification semantics", async () => {
    await createOrder(users[1].id, 0, "DELIVERED");
    await createOrder(users[2].id, 0, "DELIVERED");
    for (const [index, rating] of [5, 4, 3].entries()) {
      customerId = users[index].id;
      await saveReview({ productId: products[0].id, rating, body: `Controlled rating ${rating} review.` });
      expect(await canReviewProduct(products[0].id, users[index].id)).toBe(true);
    }
    let aggregate = await getProductReviews(products[0].id);
    expect(aggregate.average).toBe(4);
    expect(aggregate.count).toBe(3);
    adminAllowed = true;
    const hidden = await prisma.review.findUniqueOrThrow({ where: { productId_userId: { productId: products[0].id, userId: users[2].id } } });
    await setReviewPublication(hidden.id, false);
    aggregate = await getProductReviews(products[0].id);
    expect(aggregate.average).toBe(4.5);
    expect(aggregate.count).toBe(2);
  });
});
