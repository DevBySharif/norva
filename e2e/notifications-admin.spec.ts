/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/db/prisma";
import { privateEnv } from "./helpers/env";
import { runId } from "./helpers/test-data";
import { emailsTo, latestEmailTo, linkFromText } from "./helpers/email-capture";

const id = runId();
const guestEmail = `notif-admin-guest-${id}@example.test`;
const categorySlug = `e2e-notif-cat-${id}`;
const productSlug = `e2e-notif-prod-${id}`;
const productSku = `E2E-NOTIF-${id}`;
let product: any;
let orderNumber = "";
let orderId = "";
let trackingUrl = "";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("Phase 4B Notifications (admin)", () => {
  async function fillContact(page: Page, contactEmail: string) {
    await page.getByLabel("Full name").fill("Notify Guest Contact");
    await page.getByLabel("Email", { exact: true }).fill(contactEmail);
    await page.getByLabel("Phone", { exact: true }).fill("+1 555 010 0501");
    await page.getByLabel("Address line 1").fill("1 Notify Way");
    await page.getByLabel("City").fill("Notifyville");
    await page.getByLabel("State / region").fill("CA");
    await page.getByLabel("Postal code").fill("90002");
    await page.getByLabel("Country").fill("United States");
  }

  test.beforeAll(async () => {
    await prisma.notificationOutbox.deleteMany({ where: { email: guestEmail } });
    await prisma.product.deleteMany({ where: { slug: productSlug } });
    await prisma.category.deleteMany({ where: { slug: categorySlug } });

    const cat = await prisma.category.create({ data: { name: "Notify Tests", slug: categorySlug } });
    product = await prisma.product.create({
      data: {
        name: "Notify Product",
        slug: productSlug,
        sku: productSku,
        basePrice: 21,
        status: "ACTIVE",
        categoryId: cat.id,
        variants: { create: { name: "Standard", sku: `${productSku}-V`, price: 21, inventory: { create: { quantity: 50, reorderPoint: 0 } } } },
      },
      include: { variants: true },
    });
  });

  test.afterAll(async () => {
    const orders = await prisma.order.findMany({ where: { email: guestEmail }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entityType: "Order", entityId: { in: orders.map((o) => o.id) } } });
    await prisma.notificationOutbox.deleteMany({ where: { email: guestEmail } });
    await prisma.order.deleteMany({ where: { email: guestEmail } });
    await prisma.auditLog.deleteMany({ where: { entityType: "Product", entityId: product.id } });
    await prisma.product.deleteMany({ where: { slug: product.slug } });
    await prisma.category.deleteMany({ where: { slug: categorySlug } });
  });

  test("NC1: order emails are enqueued atomically, flushed on admin confirm, and link to the guest order", async ({ page, context }) => {
    // Drop the admin session for a true guest checkout.
    await context.clearCookies();
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("norva_cart_v1"));
    await page.reload();
    await page.goto(`/products/${product.slug}`);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await page.goto("/checkout");
    await expect(page.getByTestId("place-order")).toBeEnabled({ timeout: 15_000 });
    await fillContact(page, guestEmail);
    await page.getByTestId("place-order").click();
    await page.waitForURL(/\/order-success\//, { timeout: 15_000 });
    orderNumber = (await page.getByTestId("order-reference").textContent())!.trim();
    expect(orderNumber).toMatch(/^NORVA-/);

    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber } });
    orderId = order.id;

    // Enqueued atomically and flushed via `after()`.
    await expect.poll(async () => {
      const row = await prisma.notificationOutbox.findUnique({ where: { eventKey: `${orderId}:ORDER_CREATED` } });
      return row?.status;
    }).toBe("SENT");

    const createdRow = await prisma.notificationOutbox.findUniqueOrThrow({ where: { eventKey: `${orderId}:ORDER_CREATED` } });
    const payload = createdRow.payload as { guestUrl?: string | null; items: unknown[] };
    expect(payload.guestUrl).toMatch(/\/orders\//);
    expect(payload.guestUrl).toContain("access=");
    expect(Array.isArray(payload.items)).toBe(true);

    await expect.poll(async () => emailsTo(guestEmail).length).toBe(1);

    // Re-authenticate as the super admin and confirm the order — the action flushes the outbox.
    await page.goto("/admin/login");
    await page.getByLabel("Email").fill(privateEnv("DEV_ADMIN_EMAIL"));
    await page.getByLabel("Password").fill(privateEnv("DEV_ADMIN_PASSWORD"));
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin$/);

    await page.goto(`/admin/orders/${orderId}`);
    await page.getByTestId("order-status-select").selectOption("CONFIRMED");
    await page.getByTestId("order-status-apply").click();
    await expect(page.getByTestId("order-action-message")).toContainText("moved to confirmed");

    // The flush delivered ORDER_CREATED + ORDER_CONFIRMED to the capture provider.
    await expect.poll(async () => emailsTo(guestEmail).length).toBeGreaterThanOrEqual(2);
    const created = latestEmailTo(guestEmail, (e) => /Your order is confirmed/.test(e.subject));
    const confirmed = latestEmailTo(guestEmail, (e) => /Order confirmed/.test(e.subject));
    expect(created).toBeTruthy();
    expect(confirmed).toBeTruthy();
    trackingUrl = linkFromText(created!.text, `/orders/${orderNumber}`)!;
    expect(trackingUrl).toContain("access=");

    const rows = await prisma.notificationOutbox.findMany({ where: { orderId, status: "SENT" } });
    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.attempts >= 1)).toBe(true);
    expect(rows.every((r) => r.provider === "dev")).toBe(true);

    // The tracking link works without any session.
    const guestTab = await context.newPage();
    await guestTab.goto(trackingUrl);
    await expect(guestTab.getByTestId("guest-status")).toBeVisible();
  });

  test("NC2: admin notifications ledger lists rows and retries a failed one", async ({ page }) => {
    const row = await prisma.notificationOutbox.findFirstOrThrow({ where: { orderId, eventType: "ORDER_CREATED" } });
    await prisma.notificationOutbox.update({
      where: { id: row.id },
      data: { status: "FAILED", attempts: 5, lastError: "Simulated delivery failure", nextAttemptAt: null },
    });

    await page.goto("/admin/notifications");
    const failedChip = page.getByTestId("notify-status-chip-FAILED");
    await expect(failedChip).toContainText("FAILED");
    await expect(failedChip).toContainText("1");
    await failedChip.click();
    await expect(page.getByTestId(`notify-row-status-${row.id}`)).toHaveText("FAILED");

    await page.getByTestId(`notify-retry-${row.id}`).click();

    await expect.poll(async () => {
      const after = await prisma.notificationOutbox.findUnique({ where: { id: row.id } });
      return after?.status;
    }).toBe("PENDING");

    await page.goto("/admin/notifications");
    await expect(page.getByTestId(`notify-row-status-${row.id}`)).toHaveText("PENDING");

    const after = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.attempts).toBe(0);
  });
});
