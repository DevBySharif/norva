/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/db/prisma";
import { runId } from "./helpers/test-data";

const id = runId();
const email = `checkout-${id}@example.test`;

test.describe.configure({ mode: "serial" });

test.describe("Checkout & Order Creation", () => {
  let page: Page;
  let simple: any;
  let multi: any;
  let lowstock: any;
  let draftProduct: any;
  let archivedProduct: any;
  let doubleProduct: any;
  let blackSVariant: any;
  let whiteMVariant: any;

  async function resetCart() {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("norva_cart_v1"));
    await page.reload();
  }

  async function fillContact(contactEmail = email) {
    await page.getByLabel("Full name").fill("E2E Checkout Customer");
    await page.getByLabel("Email", { exact: true }).fill(contactEmail);
    await page.getByLabel("Phone", { exact: true }).fill("+1 555 010 0123");
    await page.getByLabel("Address line 1").fill("1 Test Way");
    await page.getByLabel("City").fill("Testville");
    await page.getByLabel("State / region").fill("TS");
    await page.getByLabel("Postal code").fill("10001");
    await page.getByLabel("Country").fill("United States");
  }

  async function goToCheckoutAndWait() {
    await page.goto("/checkout");
    await expect(page.getByTestId("place-order")).toBeEnabled({ timeout: 15_000 });
  }

  async function placeAndGetReference(): Promise<string> {
    await page.getByTestId("place-order").click();
    await page.waitForURL(/\/order-success\//, { timeout: 15_000 });
    const ref = (await page.getByTestId("order-reference").textContent())!.trim();
    expect(ref).toMatch(/^NORVA-/);
    return ref;
  }

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Remove stale orders from prior/aborted runs so FK cleanup below is safe.
    const stale = await prisma.order.findMany({ where: { email: { endsWith: "@example.test" } }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entityType: "Order", entityId: { in: stale.map((o) => o.id) } } });
    await prisma.order.deleteMany({ where: { email: { endsWith: "@example.test" } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: "checkout-test-" } } });
    await prisma.category.deleteMany({ where: { slug: "checkout-test-cat" } });

    const cat = await prisma.category.create({ data: { name: "Checkout Tests", slug: "checkout-test-cat" } });

    simple = await prisma.product.create({
      data: {
        name: "Checkout Test Simple",
        slug: "checkout-test-simple",
        sku: "CK-SIMP-01",
        basePrice: 55,
        status: "ACTIVE",
        categoryId: cat.id,
        variants: { create: { name: "Default Variant", sku: "CK-SIMP-01", price: 55, inventory: { create: { quantity: 10, reorderPoint: 5 } } } },
      },
      include: { variants: true },
    });

    multi = await prisma.product.create({
      data: {
        name: "Checkout Test Multi",
        slug: "checkout-test-multi",
        sku: "CK-MULTI-01",
        basePrice: 65,
        status: "ACTIVE",
        categoryId: cat.id,
        options: {
          create: [
            {
              name: "Color",
              normalizedName: "color",
              position: 0,
              values: {
                create: [
                  { id: "ck-opt-color-black", value: "Black", normalizedValue: "black", position: 0 },
                  { id: "ck-opt-color-white", value: "White", normalizedValue: "white", position: 1 },
                ],
              },
            },
            {
              name: "Size",
              normalizedName: "size",
              position: 1,
              values: {
                create: [
                  { id: "ck-opt-size-s", value: "S", normalizedValue: "s", position: 0 },
                  { id: "ck-opt-size-m", value: "M", normalizedValue: "m", position: 1 },
                ],
              },
            },
          ],
        },
        variants: {
          create: [
            {
              name: "Black / S",
              sku: "CK-MULTI-BLK-S",
              price: 65,
              combinationKey: "ck-opt-color-black|ck-opt-size-s",
              inventory: { create: { quantity: 5, reorderPoint: 2 } },
              optionValues: {
                create: [
                  { optionValueId: "ck-opt-color-black" },
                  { optionValueId: "ck-opt-size-s" },
                ],
              },
            },
            {
              name: "White / M",
              sku: "CK-MULTI-WHT-M",
              price: 70,
              combinationKey: "ck-opt-color-white|ck-opt-size-m",
              inventory: { create: { quantity: 2, reorderPoint: 0 } },
              optionValues: {
                create: [
                  { optionValueId: "ck-opt-color-white" },
                  { optionValueId: "ck-opt-size-m" },
                ],
              },
            },
          ],
        },
      },
      include: { variants: true },
    });
    blackSVariant = multi.variants.find((v: any) => v.sku === "CK-MULTI-BLK-S");
    whiteMVariant = multi.variants.find((v: any) => v.sku === "CK-MULTI-WHT-M");

    lowstock = await prisma.product.create({
      data: {
        name: "Checkout Test Low Stock",
        slug: "checkout-test-lowstock",
        sku: "CK-LOW-01",
        basePrice: 80,
        status: "ACTIVE",
        categoryId: cat.id,
        variants: { create: { name: "Default", sku: "CK-LOW-01", price: 80, inventory: { create: { quantity: 1, reorderPoint: 0 } } } },
      },
      include: { variants: true },
    });

    draftProduct = await prisma.product.create({
      data: {
        name: "Checkout Test Draft",
        slug: "checkout-test-draft",
        sku: "CK-DRAFT-01",
        basePrice: 90,
        status: "ACTIVE",
        categoryId: cat.id,
        variants: { create: { name: "Default", sku: "CK-DRAFT-01", price: 90, inventory: { create: { quantity: 10, reorderPoint: 0 } } } },
      },
      include: { variants: true },
    });

    archivedProduct = await prisma.product.create({
      data: {
        name: "Checkout Test Archived",
        slug: "checkout-test-archived",
        sku: "CK-ARCH-01",
        basePrice: 95,
        status: "ACTIVE",
        categoryId: cat.id,
        variants: { create: { name: "Default", sku: "CK-ARCH-01", price: 95, inventory: { create: { quantity: 10, reorderPoint: 0 } } } },
      },
      include: { variants: true },
    });

    doubleProduct = await prisma.product.create({
      data: {
        name: "Checkout Test Double",
        slug: "checkout-test-double",
        sku: "CK-DBL-01",
        basePrice: 45,
        status: "ACTIVE",
        categoryId: cat.id,
        variants: { create: { name: "Default", sku: "CK-DBL-01", price: 45, inventory: { create: { quantity: 5, reorderPoint: 0 } } } },
      },
      include: { variants: true },
    });
  });

  test.afterAll(async () => {
    const placed = await prisma.order.findMany({ where: { email: { endsWith: "@example.test" } }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entityType: "Order", entityId: { in: placed.map((o) => o.id) } } });
    await prisma.order.deleteMany({ where: { email: { endsWith: "@example.test" } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: "checkout-test-" } } });
    await prisma.category.deleteMany({ where: { slug: "checkout-test-cat" } });
    await page.close();
  });

  test("C33: full checkout creates an order, clears the cart, and reserves stock", async () => {
    await resetCart();
    await page.goto(`/products/${simple.slug}`);
    await page.getByRole("button", { name: "Add to cart" }).click();

    await page.goto("/cart");
    await page.getByRole("link", { name: "Proceed to checkout" }).click();
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
    await fillContact();
    await expect(page.getByTestId("checkout-total")).toContainText("$55.00");

    const ref = await placeAndGetReference();
    await expect(page.getByRole("heading", { name: "Order confirmed" })).toBeVisible();

    const order = await prisma.order.findUnique({ where: { orderNumber: ref }, include: { items: true, payment: true, statusHistory: true } });
    expect(order).toBeTruthy();
    expect(order!.status).toBe("PENDING");
    expect(Number(order!.subtotal)).toBe(55);
    expect(Number(order!.shippingTotal)).toBe(0);
    expect(Number(order!.taxTotal)).toBe(0);
    expect(Number(order!.grandTotal)).toBe(55);
    expect(order!.currency).toBe("USD");
    expect(order!.payment?.provider).toBe("COD");
    expect(order!.payment?.status).toBe("PENDING");
    expect(Number(order!.payment?.amount)).toBe(55);
    expect(order!.items).toHaveLength(1);
    expect(order!.items[0]?.productName).toBe("Checkout Test Simple");
    expect(order!.items[0]?.variantName).toBe("Default Variant");
    expect(order!.items[0]?.sku).toBe("CK-SIMP-01");
    expect(order!.items[0]?.quantity).toBe(1);
    expect(Number(order!.items[0]?.unitPrice)).toBe(55);
    expect(Number(order!.items[0]?.lineTotal)).toBe(55);
    expect(order!.statusHistory.map((h) => h.status)).toEqual(["PENDING"]);

    // Stock reserved but physical quantity untouched.
    const inv = await prisma.inventory.findUnique({ where: { variantId: simple.variants[0].id } });
    expect(Number(inv!.quantity)).toBe(10);
    expect(Number(inv!.reservedQuantity)).toBe(1);

    // Audit trail.
    const audit = await prisma.auditLog.findMany({ where: { entityType: "Order", entityId: order!.id } });
    expect(audit.some((a) => a.action === "ORDER_CREATED")).toBe(true);

    // Cart cleared after successful order.
    await page.goto("/cart");
    await expect(page.getByText("Your cart is currently empty.")).toBeVisible();

    // C29: reloading the confirmation must not create a duplicate order.
    await page.goto(`/order-success/${ref}`);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Order confirmed" })).toBeVisible();
    expect(await prisma.order.count({ where: { orderNumber: ref } })).toBe(1);
  });

  test("C34: multi-variant checkout snapshots the exact variant", async () => {
    await resetCart();
    await page.goto(`/products/${multi.slug}`);
    await page.getByRole("button", { name: "Black", exact: true }).click();
    await page.getByRole("button", { name: "S", exact: true }).click();
    await page.getByRole("button", { name: "Add to cart" }).click();

    await page.goto("/cart");
    await page.getByRole("link", { name: "Proceed to checkout" }).click();
    await fillContact();

    const ref = await placeAndGetReference();
    const order = await prisma.order.findUnique({ where: { orderNumber: ref }, include: { items: true } });
    expect(order!.items).toHaveLength(1);
    expect(order!.items[0]?.variantId).toBe(blackSVariant.id);
    expect(order!.items[0]?.variantName).toBe("Black / S");
    expect(order!.items[0]?.sku).toBe("CK-MULTI-BLK-S");
    expect(order!.items[0]?.productId).toBe(multi.id);
    expect(Number(order!.items[0]?.unitPrice)).toBe(65);
    expect(Number(order!.items[0]?.lineTotal)).toBe(65);
    expect(Number(order!.grandTotal)).toBe(65);
  });

  test("C35: multiple lines with quantities are preserved exactly", async () => {
    await resetCart();
    await page.goto(`/products/${multi.slug}`);
    await page.getByRole("button", { name: "Black", exact: true }).click();
    await page.getByRole("button", { name: "S", exact: true }).click();
    await page.getByRole("button", { name: "Add to cart" }).click();
    await page.getByRole("button", { name: "White", exact: true }).click();
    await page.getByRole("button", { name: "M", exact: true }).click();
    await page.getByRole("button", { name: "Add to cart" }).click();
    await page.getByRole("button", { name: "Add to cart" }).click(); // merges to qty 2

    await page.goto("/cart");
    await page.getByRole("link", { name: "Proceed to checkout" }).click();
    await fillContact();
    await expect(page.getByTestId("checkout-total")).toContainText("$205.00");

    const ref = await placeAndGetReference();
    const order = await prisma.order.findUnique({ where: { orderNumber: ref }, include: { items: true } });
    expect(order!.items).toHaveLength(2);
    const black = order!.items.find((i) => i.sku === "CK-MULTI-BLK-S")!;
    const white = order!.items.find((i) => i.sku === "CK-MULTI-WHT-M")!;
    expect(black.quantity).toBe(1);
    expect(Number(black.lineTotal)).toBe(65);
    expect(white.quantity).toBe(2);
    expect(Number(white.unitPrice)).toBe(70);
    expect(Number(white.lineTotal)).toBe(140);
    expect(Number(order!.subtotal)).toBe(205);
    expect(Number(order!.grandTotal)).toBe(205);
  });

  test("C36: server price wins after a price change", async () => {
    await resetCart();
    await page.goto(`/products/${simple.slug}`);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await goToCheckoutAndWait();

    // Change the price after the checkout UI has hydrated its (stale) snapshot.
    await prisma.productVariant.update({ where: { id: simple.variants[0].id }, data: { price: 99 } });
    await fillContact();

    const ref = await placeAndGetReference();
    const order = await prisma.order.findUnique({ where: { orderNumber: ref }, include: { items: true } });
    expect(Number(order!.items[0]?.unitPrice)).toBe(99);
    expect(Number(order!.items[0]?.lineTotal)).toBe(99);
    expect(Number(order!.grandTotal)).toBe(99);

    // Confirmation page reflects the authoritative server total.
    await expect(page.getByText("$99.00", { exact: true }).last()).toBeVisible();
  });

  test("C37: insufficient stock is rejected with no order and no reservation", async () => {
    await resetCart();
    await page.goto(`/products/${lowstock.slug}`);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await goToCheckoutAndWait();

    // Twin the available stock to zero after the page hydrated.
    await prisma.inventory.update({ where: { variantId: lowstock.variants[0].id }, data: { quantity: 0, reservedQuantity: 0 } });
    await fillContact();

    await page.getByTestId("place-order").click();
    await expect(page.getByTestId("checkout-error")).toBeVisible();
    await expect(page.getByTestId("checkout-error")).toContainText("review your cart");

    // No order line was created and nothing was reserved.
    expect(await prisma.orderItem.count({ where: { sku: "CK-LOW-01" } })).toBe(0);
    const inv = await prisma.inventory.findUnique({ where: { variantId: lowstock.variants[0].id } });
    expect(Number(inv!.quantity)).toBe(0);
    expect(Number(inv!.reservedQuantity)).toBe(0);

    // Cart is retained and the line re-hydrated as unavailable.
    await page.goto("/cart");
    await expect(page.getByText("Out of stock", { exact: true }).first()).toBeVisible();
  });

  test("C38a: DRAFT product blocks order placement", async () => {
    await resetCart();
    await page.goto(`/products/${draftProduct.slug}`);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await goToCheckoutAndWait();

    await prisma.product.update({ where: { id: draftProduct.id }, data: { status: "DRAFT" } });
    await fillContact();

    await page.getByTestId("place-order").click();
    await expect(page.getByTestId("checkout-error")).toBeVisible();
    expect(await prisma.orderItem.count({ where: { sku: "CK-DRAFT-01" } })).toBe(0);
  });

  test("C38b: ARCHIVED product blocks order placement", async () => {
    await resetCart();
    await page.goto(`/products/${archivedProduct.slug}`);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await goToCheckoutAndWait();

    await prisma.product.update({ where: { id: archivedProduct.id }, data: { status: "ARCHIVED" } });
    await fillContact();

    await page.getByTestId("place-order").click();
    await expect(page.getByTestId("checkout-error")).toBeVisible();
    expect(await prisma.orderItem.count({ where: { sku: "CK-ARCH-01" } })).toBe(0);
  });

  test("C39: double submit creates exactly one order", async () => {
    await resetCart();
    await page.goto(`/products/${doubleProduct.slug}`);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await goToCheckoutAndWait();
    await fillContact();

    await expect(page.getByTestId("place-order")).toBeEnabled();
    // Two native clicks in the same tick, before React disables the button.
    await page.getByTestId("place-order").evaluate((el) => {
      const btn = el as HTMLButtonElement;
      btn.click();
      btn.click();
    });
    await page.waitForURL(/\/order-success\//, { timeout: 15_000 });

    // Exactly one order exists for this product/sku.
    const orders = await prisma.orderItem.findMany({ where: { sku: "CK-DBL-01" }, select: { orderId: true } });
    expect(orders).toHaveLength(1);
    const order = await prisma.order.findUnique({ where: { id: orders[0]!.orderId } });
    expect(Number(order!.grandTotal)).toBe(45);
  });

  test("C40: invalid customer details show friendly inline errors and create no order", async () => {
    await resetCart();
    await page.goto(`/products/${simple.slug}`);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await goToCheckoutAndWait();

    const before = await prisma.orderItem.count({ where: { sku: "CK-SIMP-01" } });
    await page.getByTestId("place-order").click();

    await expect(page.getByTestId("checkout-error")).toBeVisible();
    await expect(page.getByText("Full name is required.")).toBeVisible();
    await expect(page.getByText("A valid email address is required.")).toBeVisible();
    await expect(page.getByText("A valid phone number is required.")).toBeVisible();
    await expect(page.getByText("Address line 1 is required.")).toBeVisible();
    await expect(page.getByText("City is required.")).toBeVisible();

    const after = await prisma.orderItem.count({ where: { sku: "CK-SIMP-01" } });
    expect(after).toBe(before);
  });

  test("C41: a single invalid line blocks the whole order atomically", async () => {
    const reservedBefore = Number((await prisma.inventory.findUnique({ where: { variantId: blackSVariant.id } }))!.reservedQuantity);
    const blackItemsBefore = await prisma.orderItem.count({ where: { sku: "CK-MULTI-BLK-S" } });
    const whiteItemsBefore = await prisma.orderItem.count({ where: { sku: "CK-MULTI-WHT-M" } });

    await resetCart();
    await prisma.inventory.update({ where: { variantId: whiteMVariant.id }, data: { quantity: 5 } });
    await page.goto(`/products/${multi.slug}`);
    await page.getByRole("button", { name: "Black", exact: true }).click();
    await page.getByRole("button", { name: "S", exact: true }).click();
    await page.getByRole("button", { name: "Add to cart" }).click();
    await page.getByRole("button", { name: "White", exact: true }).click();
    await page.getByRole("button", { name: "M", exact: true }).click();
    await page.getByRole("button", { name: "Add to cart" }).click();
    await goToCheckoutAndWait();

    // Take the White / M line offline so this item is invalid but Black / S remains orderable.
    await prisma.product.update({ where: { id: multi.id }, data: { status: "DRAFT" } });
    await fillContact();

    await page.getByTestId("place-order").click();
    await expect(page.getByTestId("checkout-error")).toBeVisible();
    await expect(page.getByTestId("checkout-error")).toContainText("review your cart");

    // Nothing was created and no stock was reserved, even for the valid line.
    expect(await prisma.orderItem.count({ where: { sku: "CK-MULTI-BLK-S" } })).toBe(blackItemsBefore);
    expect(await prisma.orderItem.count({ where: { sku: "CK-MULTI-WHT-M" } })).toBe(whiteItemsBefore);
    const inv = await prisma.inventory.findUnique({ where: { variantId: blackSVariant.id } });
    expect(Number(inv!.reservedQuantity)).toBe(reservedBefore);
  });
});