import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/db/prisma";
import { runId } from "./helpers/test-data";

const id = runId();
const email = `e2e-lifecycle-${id}@example.gov`;
const productName = `Lifecycle Test Product ${id}`;
const productSlug = `e2e-lifecycle-product-${id}`;
const variantSku = `LC-E2E-${id}`;

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

test.describe("Order lifecycle (admin fulfillment)", () => {
  let page: Page;
  let product: { id: string; slug: string; variants: { id: string }[] };
  const orderIdByNumber = new Map<string, string>();
  let orderNumberDelivered = "";
  let orderNumberCancelled = "";

  async function resetCart() {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("norva_cart_v1"));
    await page.reload();
  }

  async function placeOrderFromStorefront(): Promise<string> {
    await resetCart();
    await page.goto(`/products/${product.slug}`);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await page.goto("/cart");
    await page.getByRole("link", { name: "Proceed to checkout" }).click();
    await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
    await page.getByLabel("Full name").fill("E2E Lifecycle Customer");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Phone", { exact: true }).fill("+1 555 010 0456");
    await page.getByLabel("Address line 1").fill("9 Fulfilment Way");
    await page.getByLabel("City").fill("Fulfilville");
    await page.getByLabel("State / region").fill("TS");
    await page.getByLabel("Postal code").fill("12345");
    await page.getByLabel("Country").fill("United States");
    await page.getByTestId("place-order").click();
    await page.waitForURL(/\/order-success\//, { timeout: 15_000 });
    const reference = (await page.getByTestId("order-reference").textContent())!.trim();
    expect(reference).toMatch(/^NORVA-/);
    return reference;
  }

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    await prisma.order.deleteMany({ where: { email } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: "e2e-lifecycle-product-" } } });

    const category = await prisma.category.create({
      data: { name: `Lifecycle E2E ${id}`, slug: `e2e-lifecycle-cat-${id}` },
    });

    product = await prisma.product.create({
      data: {
        name: productName,
        slug: productSlug,
        sku: `LC-E2E-${id}`,
        basePrice: 75,
        status: "ACTIVE",
        categoryId: category.id,
        variants: {
          create: {
            name: "Default Variant",
            sku: variantSku,
            price: 75,
            costPrice: 5,
            inventory: { create: { quantity: 10, reorderPoint: 3 } },
          },
        },
      },
      include: { variants: true },
    });
  });

  test.afterAll(async () => {
    const placed = await prisma.order.findMany({ where: { email }, select: { id: true } });
    const ids = placed.map((o) => o.id);
    const payments = await prisma.payment.findMany({ where: { orderId: { in: ids } }, select: { id: true } });
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityType: "Order", entityId: { in: ids } },
          { entityType: "Payment", entityId: { in: payments.map((p) => p.id) } },
        ],
      },
    });
    await prisma.order.deleteMany({ where: { email } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: "e2e-lifecycle-product-" } } });
    await prisma.category.deleteMany({ where: { slug: `e2e-lifecycle-cat-${id}` } });
    await page.close();
  });

  async function adminDetail(ref: string) {
    const order = await prisma.order.findUnique({ where: { orderNumber: ref }, select: { id: true } });
    expect(order).toBeTruthy();
    orderIdByNumber.set(ref, order!.id);
    await page.goto(`/admin/orders/${order!.id}`);
    // Wait out the transient Next.js stream/refresh duplication (footgun: a stale <main> can briefly coexist).
    await page.waitForFunction(() => document.querySelectorAll("main").length === 1, undefined, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: ref })).toBeVisible();
    return order!.id;
  }

  async function waitForBadge(toStatus: string) {
    try {
      await expect(page.getByTestId("order-status-badge")).toHaveText(toStatus, { timeout: 8_000 });
    } catch {
      await page.reload();
      await page.waitForFunction(() => document.querySelectorAll("main").length === 1, undefined, { timeout: 15_000 });
      await expect(page.getByTestId("order-status-badge")).toHaveText(toStatus, { timeout: 8_000 });
    }
  }

  async function advance(ref: string, toStatus: string, { note, internalNote }: { note?: string; internalNote?: string } = {}) {
    await adminDetail(ref);
    await page.getByTestId("order-status-select").selectOption(toStatus);
    if (note) await page.getByTestId("order-status-note").fill(note);
    if (internalNote) await page.getByTestId("order-status-internal-note").fill(internalNote);
    await page.getByTestId("order-status-apply").click();
    await expect(page.getByTestId("order-action-message")).toContainText(/Order moved to/i, { timeout: 15_000 });
    await waitForBadge(toStatus);
  }

  test("L01: a storefront order is driven PENDING → CONFIRMED → PROCESSING → (COD paid) → SHIPPED → DELIVERED atomically", async () => {
    const ref = await placeOrderFromStorefront();
    orderNumberDelivered = ref;

    // The confirmation page exposes the secure guest lookup link.
    await expect(page.getByTestId("view-order-link")).toBeVisible();
    const linkHref = await page.getByTestId("view-order-link").getAttribute("href");
    expect(linkHref).toContain(`/orders/${ref}?access=`);

    // Success page → guest order shows the fresh PENDING state.
    await page.getByTestId("view-order-link").click();
    await expect(page).toHaveURL(/\/orders\/.+\?access=/);
    await expect(page.getByTestId("guest-status")).toHaveText("Order placed");

    const order = await prisma.order.findUnique({ where: { orderNumber: ref }, include: { items: true, payments: { orderBy: { createdAt: "desc" }, take: 1 } } });
    expect(order!.lookupToken).toBeTruthy();
    expect(order!.items[0]?.productName).toBe(productName);
    expect(Number(order!.items[0]?.unitPrice)).toBe(75);
    expect(order!.payments?.[0]?.status).toBe("PENDING");

    // Admin: CONFIRMED with both a customer note and a staff-only internal note.
    await advance(ref, "CONFIRMED", { note: "Thank you for shopping with us", internalNote: "Priority handling" });
    const confirmed = await prisma.order.findUnique({ where: { orderNumber: ref }, include: { statusHistory: true } });
    expect(confirmed!.status).toBe("CONFIRMED");
    expect(confirmed!.statusHistory.map((h) => h.status)).toEqual(["PENDING", "CONFIRMED"]);
    const confirmedEntry = confirmed!.statusHistory.find((h) => h.status === "CONFIRMED")!;
    expect(confirmedEntry.fromStatus).toBe("PENDING");
    expect(confirmedEntry.note).toBe("Thank you for shopping with us");
    expect(confirmedEntry.internalNote).toBe("Priority handling");
    expect(confirmedEntry.actorType).toBe("ADMIN");
    // Admin detail renders the staff note with a dedicated marker.
    await expect(page.getByTestId("internal-note")).toContainText("Priority handling");
    // Confirming must not touch stock.
    let inv = await prisma.inventory.findUnique({ where: { variantId: product.variants[0].id } });
    expect(Number(inv!.quantity)).toBe(10);
    expect(Number(inv!.reservedQuantity)).toBe(1);

    await advance(ref, "PROCESSING");
    await expect(page.getByTestId("order-status-badge")).toHaveText("PROCESSING");

    // Collect COD payment at the door before shipping.
    await adminDetail(ref);
    await page.getByTestId("payment-mark-received").click();
    await expect(page.getByTestId("order-action-message")).toContainText("Payment received", { timeout: 15_000 });
    const paidOrder = await prisma.order.findUnique({ where: { orderNumber: ref }, include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } } });
    expect(paidOrder!.payments?.[0]?.status).toBe("PAID");

    await advance(ref, "SHIPPED", { note: "Left the warehouse" });
    const shippedOrder = await prisma.order.findUnique({ where: { orderNumber: ref } });
    expect(shippedOrder!.status).toBe("SHIPPED");
    // Shipping is the single finalization point.
    inv = await prisma.inventory.findUnique({ where: { variantId: product.variants[0].id } });
    expect(Number(inv!.quantity)).toBe(9);
    expect(Number(inv!.reservedQuantity)).toBe(0);
    const shipAudit = await prisma.auditLog.findFirst({
      where: { entityType: "Order", entityId: shippedOrder!.id, action: "ORDER_STATUS_CHANGED", metadata: { path: ["toStatus"], equals: "SHIPPED" } },
    });
    expect((shipAudit?.metadata as { inventoryAction?: string })?.inventoryAction).toBe("finalize");

    await advance(ref, "DELIVERED");
    // Payment was already captured; the COD button must be gone and no further transitions legal.
    await expect(page.getByTestId("payment-mark-received")).toHaveCount(0);
    await expect(page.getByTestId("order-status-select")).toHaveCount(0);
    await expect(page.getByText("No further status changes are available for this order.")).toBeVisible();
    const deliveredAudit = await prisma.auditLog.count({
      where: { entityType: "Payment", action: "PAYMENT_STATUS_CHANGED" },
    });
    expect(deliveredAudit).toBeGreaterThanOrEqual(1);
  });

  test("L02: cancelling before shipment releases stock exactly once with a friendly double-cancel guard", async () => {
    const ref = await placeOrderFromStorefront();
    orderNumberCancelled = ref;

    await advance(ref, "CANCELLED", { note: "Customer changed their mind" });
    const cancelled = await prisma.order.findUnique({ where: { orderNumber: ref }, include: { statusHistory: true } });
    expect(cancelled!.status).toBe("CANCELLED");
    expect(cancelled!.statusHistory.map((h) => h.status)).toEqual(["PENDING", "CANCELLED"]);
    expect(cancelled!.statusHistory.find((h) => h.status === "CANCELLED")!.fromStatus).toBe("PENDING");

    const inv = await prisma.inventory.findUnique({ where: { variantId: product.variants[0].id } });
    expect(Number(inv!.quantity)).toBe(9); // physical stock untouched
    expect(Number(inv!.reservedQuantity)).toBe(0); // reservation returned
    const cancelledAudit = await prisma.auditLog.count({ where: { entityType: "Order", entityId: cancelled!.id, action: "ORDER_CANCELLED" } });
    expect(cancelledAudit).toBe(1);

    // No legal transitions remain from CANCELLED.
    await adminDetail(ref);
    await expect(page.getByTestId("order-status-select")).toHaveCount(0);
    await expect(page.getByText("No further status changes are available for this order.")).toBeVisible();
  });

  test("L03: guest lookup is private, snapshot-faithful, and token-protected", async () => {
    // The catalog entry changes after the delivered order was placed.
    await prisma.productVariant.update({ where: { id: product.variants[0].id }, data: { sku: "LC-E2E-EDITED", price: 99, costPrice: 2 } });
    await prisma.product.update({ where: { id: product.id }, data: { name: `${productName} EDITED`, sku: "LC-E2E-EDITED" } });

    await page.goto("/orders/lookup");
    await page.getByTestId("lookup-order-number").fill(orderNumberDelivered);
    await page.getByTestId("lookup-email").fill("someone-else@example.gov");
    await page.getByTestId("lookup-submit").click();
    await expect(page.getByTestId("lookup-error")).toContainText("We couldn't find an order matching those details.");
    await expect(page).toHaveURL(/\/orders\/lookup$/);

    await page.getByTestId("lookup-email").fill(email);
    await page.getByTestId("lookup-submit").click();
    await expect(page).toHaveURL(new RegExp(`/orders/${orderNumberDelivered}\\?access=`));

    // Delivered status + settled payment.
    await expect(page.getByTestId("guest-status")).toHaveText("Delivered");
    await expect(page.getByText("Status: PAID")).toBeVisible();

    // Snapshot fidelity: the page shows the placement-time name/sku/price, not the edited catalog.
    await expect(page.getByTestId("guest-item")).toContainText(productName);
    await expect(page.getByTestId("guest-item")).toContainText(variantSku);
    await expect(page.getByText("$75.00", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("EDITED", { exact: false })).toHaveCount(0);

    // Privacy: no staff-only fields, no costs, no audits.
    await expect(page.getByText("Internal", { exact: false })).toHaveCount(0);
    await expect(page.getByText("Priority handling", { exact: false })).toHaveCount(0);
    await expect(page.getByText("$5.00")).toHaveCount(0);
    await expect(page.getByText("costPrice", { exact: false })).toHaveCount(0);
    // Customer-visible notes appear in the guest timeline.
    await expect(page.getByTestId("guest-timeline")).toContainText("Thank you for shopping with us");
    await expect(page.getByTestId("guest-timeline")).toContainText("Left the warehouse");

    // Anonymous access with a wrong token must render the app's not-found page, never the order.
    await page.goto(`/orders/${orderNumberDelivered}?access=deadbeef`);
    await expect(page.getByTestId("guest-status")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "This page has moved on." })).toBeVisible();
  });

  test("L04: the admin list surfaces live per-status counts and the filters narrow results", async () => {
    async function settleList() {
      // Next.js can transiently duplicate an admin page while a prior RSC stream settles; wait for a single main.
      await page.waitForFunction(() => document.querySelectorAll("main").length === 1, undefined, { timeout: 15_000 });
    }

    await page.goto("/admin/orders");
    await settleList();
    // Delivered + Cancelled rows exist for this run, and live status chips render.
    await expect(page.getByTestId(`order-row-status-${orderIdByNumber.get(orderNumberCancelled)!}`).first()).toHaveText("CANCELLED");
    await expect(page.getByTestId(`status-chip-DELIVERED`)).toBeVisible();
    await expect(page.getByTestId(`status-chip-CANCELLED`)).toContainText(/CANCELLED · \d+/);

    // Filtering by status keeps the cancelled order and hides the delivered one.
    await page.goto("/admin/orders?status=CANCELLED");
    await settleList();
    await expect(page.getByTestId(`order-row-status-${orderIdByNumber.get(orderNumberCancelled)!}`).first()).toBeVisible();
    await expect(page.getByTestId(`order-row-status-${orderIdByNumber.get(orderNumberDelivered)!}`)).toHaveCount(0);
  });
});