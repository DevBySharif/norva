/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/db/prisma";
import { runId } from "./helpers/test-data";

const id = runId();
const password = "SecurePass-4A";
const emailA = `cust-a-${id}@example.test`;
const emailB = `cust-b-${id}@example.test`;
const guestEmail = `cust-guest-${id}@example.test`;
const nameA = "Customer Alpha";
const nameB = "Customer Bravo";

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("Phase 4A Customer Accounts", () => {
  let page: Page;
  let product: any;
  let variantId: string;
  let orderANumber = "";
  let orderATotal = "";

  const usersToCleanup = new Set<string>();

  async function resetCart() {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("norva_cart_v1"));
    await page.reload();
  }

  async function register(email: string, name: string) {
    await page.goto("/register");
    await page.getByLabel("Full name").fill(name);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel(/^Phone/).fill("");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/account$/);
  }

  async function login(email: string) {
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/account$/);
  }

  async function logout() {
    await page.goto("/account");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL((url) => url.pathname === "/");
  }

  async function addToCart() {
    await page.goto(`/products/${product.slug}`);
    await page.getByRole("button", { name: "Add to cart" }).click();
  }

  async function fillContact(contactEmail: string) {
    await page.getByLabel("Full name").fill("E2E Customer Contact");
    await page.getByLabel("Email", { exact: true }).fill(contactEmail);
    await page.getByLabel("Phone", { exact: true }).fill("+1 555 010 0421");
    await page.getByLabel("Address line 1").fill("1 Customer Way");
    await page.getByLabel("City").fill("Accountville");
    await page.getByLabel("State / region").fill("CA");
    await page.getByLabel("Postal code").fill("90001");
    await page.getByLabel("Country").fill("United States");
  }

  async function placeOrder(contactEmail: string): Promise<string> {
    await page.goto("/checkout");
    await expect(page.getByTestId("place-order")).toBeEnabled({ timeout: 15_000 });
    await fillContact(contactEmail);
    await page.getByTestId("place-order").click();
    await page.waitForURL(/\/order-success\//, { timeout: 15_000 });
    const ref = (await page.getByTestId("order-reference").textContent())!.trim();
    expect(ref).toMatch(/^NORVA-/);
    return ref;
  }

  async function lookupTokenFor(orderNumber: string) {
    const order = await prisma.order.findUnique({ where: { orderNumber }, select: { lookupToken: true } });
    return order?.lookupToken ?? "";
  }

  // React 19.2 can briefly stream Suspense content twice on hard loads before the queued
  // reveal deletes the orphaned copy (vercel/next.js#37014 upstream). Wait for it to settle.
  async function waitForOrdersListSettled() {
    await page.waitForFunction(() => document.querySelectorAll('main#main-content').length === 1, undefined, { timeout: 10_000 });
  }

  async function expectOrdersListToContain(text: string) {
    await waitForOrdersListSettled();
    await expect(page.getByTestId("orders-list")).toContainText(text);
  }

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Stale-state cleanup from any prior/aborted run.
    const stale = await prisma.order.findMany({ where: { email: { endsWith: "@example.test" } }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entityType: "Order", entityId: { in: stale.map((o) => o.id) } } });
    await prisma.order.deleteMany({ where: { email: { endsWith: "@example.test" } } });
    await prisma.product.deleteMany({ where: { slug: { startsWith: "cust-4a-product-" } } });
    await prisma.category.deleteMany({ where: { slug: "cust-4a-cat" } });
    await prisma.user.deleteMany({ where: { email: { in: [emailA, emailB, guestEmail] } } });

    const cat = await prisma.category.create({ data: { name: "Phase 4A Tests", slug: "cust-4a-cat" } });
    product = await prisma.product.create({
      data: {
        name: "Phase 4A Product",
        slug: `cust-4a-product-${id}`,
        sku: `CUST-4A-${id}`,
        basePrice: 39,
        status: "ACTIVE",
        categoryId: cat.id,
        variants: { create: { name: "Standard", sku: `CUST-4A-${id}-V`, price: 39, inventory: { create: { quantity: 50, reorderPoint: 0 } } } },
      },
      include: { variants: true },
    });
    variantId = product.variants[0].id;
  });

  test.afterAll(async () => {
    const orderIds = (await prisma.order.findMany({ where: { email: { endsWith: "@example.test" } }, select: { id: true } })).map((o) => o.id);
    await prisma.auditLog.deleteMany({ where: { entityType: "Order", entityId: { in: orderIds } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: [...usersToCleanup] } } });
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.address.deleteMany({ where: { userId: { in: [...usersToCleanup] } } });
    await prisma.user.deleteMany({ where: { id: { in: [...usersToCleanup] } } });
    await prisma.auditLog.deleteMany({ where: { entityType: "Product", entityId: product.id } });
    await prisma.product.deleteMany({ where: { slug: product.slug } });
    await prisma.category.deleteMany({ where: { slug: "cust-4a-cat" } });
    await page.close();
  });

  test("AC: registration creates a CUSTOMER with bcrypt hash and denies admin access", async () => {
    await register(emailA, nameA);

    const user = await prisma.user.findUnique({ where: { email: emailA } });
    usersToCleanup.add(user!.id);
    expect(user).toBeTruthy();
    expect(user!.role).toBe("CUSTOMER");
    expect(user!.passwordHash).toBeTruthy();
    expect(user!.passwordHash!.startsWith("$2")).toBe(true);
    expect(user!.passwordHash).not.toBe(password);
    expect(user!.passwordHash!.includes(password)).toBe(false);
    expect(user!.name).toBe(nameA);

    const audit = await prisma.auditLog.findFirst({ where: { userId: user!.id, action: "CUSTOMER_REGISTERED" } });
    expect(audit).toBeTruthy();

    // CUSTOMER session must never access admin.
    for (const path of ["/admin", "/admin/products", "/admin/orders"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/login/);
    }
  });

  test("AD: login errors are generic and valid login reaches the account", async () => {
    await logout();

    await page.goto("/account");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Faccount/);

    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(emailA);
    await page.getByLabel("Password", { exact: true }).fill("wrong-password-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("login-error")).toBeVisible();
    const invalidPasswordMessage = (await page.getByTestId("login-error").textContent())!.trim();

    await page.getByLabel("Password", { exact: true }).fill("wrong-password-1");
    await page.getByLabel("Email", { exact: true }).fill("nobody-unknown@example.test");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("login-error")).toBeVisible();
    const unknownEmailMessage = (await page.getByTestId("login-error").textContent())!.trim();

    expect(invalidPasswordMessage).toBe(unknownEmailMessage);
    expect(invalidPasswordMessage).not.toMatch(/doesn'?t exist|not found/i);
    expect(invalidPasswordMessage).not.toContain(emailA);
    expect(invalidPasswordMessage).not.toContain("nobody-unknown");

    // lastLoginAt only updates on success.
    const before = await prisma.user.findUnique({ where: { email: emailA }, select: { lastLoginAt: true } });
    await login(emailA);
    const after = await prisma.user.findUnique({ where: { email: emailA }, select: { lastLoginAt: true } });
    expect(before!.lastLoginAt).not.toBe(after!.lastLoginAt);
    await expect(page.getByRole("heading", { name: /Welcome back/ })).toBeVisible();
  });

  test("AE: logout requires login again and preserves the guest cart", async () => {
    await resetCart();
    await addToCart();
    await page.goto("/cart");
    await expect(page.getByText("Phase 4A Product")).toBeVisible();

    await logout();
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);

    // Guest cart (localStorage) survives login and logout.
    await login(emailA);
    await page.goto("/cart");
    await expect(page.getByText("Phase 4A Product")).toBeVisible();

    await logout();
    await page.goto("/cart");
    await expect(page.getByText("Phase 4A Product")).toBeVisible();
  });

  test("AG/AP: authenticated order is owned by the session user and appears in history", async () => {
    await login(emailA);
    await resetCart();
    await addToCart();
    const ref = await placeOrder(emailA);

    const order = await prisma.order.findUnique({ where: { orderNumber: ref }, select: { userId: true, email: true, grandTotal: true } });
    expect(order).toBeTruthy();
    expect(order!.email).toBe(emailA);
    const userA = await prisma.user.findUnique({ where: { email: emailA }, select: { id: true } });
    expect(order!.userId).toBe(userA!.id);

    orderANumber = ref;
    orderATotal = `$${Number(order!.grandTotal).toFixed(2)}`;

    await page.goto("/account/orders");
    await expectOrdersListToContain(ref);

    await page.goto(`/account/orders/${ref}`);
    await expect(page.getByRole("heading", { name: ref })).toBeVisible();
    await expect(page.getByTestId("customer-order-items")).toContainText("Phase 4A Product");
    await expect(page.getByTestId("customer-order-total")).toHaveText(orderATotal);
  });

  test("AH: cross-customer order detail is a safe 404", async () => {
    await logout();
    await register(emailB, nameB);
    const userB = await prisma.user.findUnique({ where: { email: emailB } });
    usersToCleanup.add(userB!.id);

    await page.goto(`/account/orders/${orderANumber}`);
    await expect(page.getByRole("heading", { name: "This page has moved on." })).toBeVisible();
    await expect(page.getByText("Phase 4A Product").first()).not.toBeVisible();

    await logout();
    await login(emailA);
    await page.goto(`/account/orders/${orderANumber}`);
    await expect(page.getByRole("heading", { name: orderANumber })).toBeVisible();
  });

  test("AI: guest order claim succeeds only with valid proof and owner", async () => {
    // Guest order placed while signed out.
    await logout();
    await resetCart();
    await addToCart();
    const guestRef = await placeOrder(guestEmail);
    const guestToken = await lookupTokenFor(guestRef);
    expect(guestToken).toHaveLength(32);
    const guestOrder = await prisma.order.findUnique({ where: { orderNumber: guestRef }, select: { userId: true } });
    expect(guestOrder!.userId).toBeNull();

    // React 19 resets the form fields after a form action completes, so fill all three each attempt.
    const claimOrder = async (orderNumber: string, email: string, accessToken: string) => {
      await waitForOrdersListSettled();
      await page.getByLabel("Order number").fill(orderNumber);
      await page.getByLabel("Email used at checkout").fill(email);
      await page.getByLabel("Access token from your confirmation link").fill(accessToken);
      await page.getByRole("button", { name: "Link order to my account" }).click();
    };

    // Wrong token fails.
    await login(emailA);
    await page.goto("/account/orders");
    await claimOrder(guestRef, guestEmail, "0".repeat(guestToken.length));
    await expect(page.getByTestId("claim-error")).toBeVisible();

    // Correct proof claims it.
    await claimOrder(guestRef, guestEmail, guestToken);
    await expect(page.getByTestId("claim-success")).toBeVisible();
    // Fresh server render proves the claimed order is now part of the account's history.
    await page.goto("/account/orders");
    await expectOrdersListToContain(guestRef);
    const claimed = await prisma.order.findUnique({ where: { orderNumber: guestRef }, select: { id: true, userId: true } });
    const userA = await prisma.user.findUnique({ where: { email: emailA }, select: { id: true } });
    expect(claimed!.userId).toBe(userA!.id);
    const claimedAudit = await prisma.auditLog.findFirst({ where: { entityType: "Order", entityId: claimed!.id, action: "ORDER_CLAIMED" } });
    expect(claimedAudit).toBeTruthy();

    // An order already owned by another customer cannot be claimed.
    await logout();
    await login(emailB);
    await page.goto("/account/orders");
    await waitForOrdersListSettled();
    await page.getByLabel("Order number").fill(guestRef);
    await page.getByLabel("Email used at checkout").fill(guestEmail);
    await page.getByLabel("Access token from your confirmation link").fill(guestToken);
    await page.getByRole("button", { name: "Link order to my account" }).click();
    await expect(page.getByTestId("claim-error")).toBeVisible();
    const stillA = await prisma.order.findUnique({ where: { orderNumber: guestRef }, select: { userId: true } });
    expect(stillA!.userId).toBe(userA!.id);
  });

  test("AJ: order detail shows immutable purchase snapshot", async () => {
    await logout();
    await login(emailA);
    await prisma.product.update({ where: { id: product.id }, data: { name: "CHANGED AFTER PURCHASE" } });
    await prisma.productVariant.update({ where: { id: variantId }, data: { price: 999, sku: "CHANGED-SKU" } });

    await page.goto(`/account/orders/${orderANumber}`);
    await expect(page.getByTestId("customer-order-items")).toContainText("Phase 4A Product");
    await expect(page.getByTestId("customer-order-items")).not.toContainText("CHANGED AFTER PURCHASE");
    await expect(page.getByTestId("customer-order-total")).toHaveText(orderATotal);
  });

  test("AK: profile update persists and cannot target another user", async () => {
    await page.goto("/account/profile");
    const newName = "Alpha Updated";
    await page.getByLabel("Full name").fill(newName);
    await page.getByLabel(/^Phone/).fill("+1 555 010 0999");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByTestId("profile-success")).toBeVisible();

    const user = await prisma.user.findUnique({ where: { email: emailA } });
    expect(user!.name).toBe(newName);
    expect(user!.phone).toBe("+1 555 010 0999");

    // No arbitrary userId field exists anywhere in the form payload.
    const html = await page.content();
    expect(html).not.toMatch(/name="userId"/);

    await page.reload();
    await expect(page.getByLabel("Full name")).toHaveValue(newName);

    const audit = await prisma.auditLog.findFirst({ where: { userId: user!.id, action: "CUSTOMER_PROFILE_UPDATED" } });
    expect(audit).toBeTruthy();
  });

  test("AL/AN: address CRUD and exactly one default", async () => {
    await page.goto("/account/addresses");
    await page.getByRole("button", { name: "Add address" }).click();

    await page.getByLabel(/Recipient name/).fill("Alpha Recipient");
    await page.getByLabel(/Address line 1/).fill("100 Alpha Street");
    await page.getByLabel(/City/).fill("A-Town");
    await page.getByLabel(/Country/).fill("United States");
    await page.getByRole("button", { name: "Save address" }).click();
    await expect(page.getByTestId("address-list")).toContainText("100 Alpha Street");

    // First address becomes default automatically; adding a second as default keeps one default.
    await page.getByRole("button", { name: "Add address" }).click();
    await page.getByLabel(/Recipient name/).fill("Second Recipient");
    await page.getByLabel(/Address line 1/).fill("200 Beta Street");
    await page.getByLabel(/City/).fill("B-Town");
    await page.getByLabel(/Country/).fill("United States");
    await page.getByLabel(/Set as my default shipping address/).check();
    await page.getByRole("button", { name: "Save address" }).click();

    const userA = await prisma.user.findUnique({ where: { email: emailA } });
    const defaults = await prisma.address.count({ where: { userId: userA!.id, isDefault: true } });
    expect(defaults).toBe(1);

    // Edit the first (non-default) address.
    const firstAddress = await prisma.address.findFirst({ where: { userId: userA!.id, line1: "100 Alpha Street" } });
    const alphaCard = page.getByTestId("address-list").locator("li", { hasText: "100 Alpha Street" });
    await alphaCard.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel(/Address line 1/).fill("100 Alpha Street Updated");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByTestId("address-list")).toContainText("100 Alpha Street Updated");
    const edited = await prisma.address.findUnique({ where: { id: firstAddress!.id } });
    expect(edited!.line1).toBe("100 Alpha Street Updated");

    // Exactly one default after editing.
    expect(await prisma.address.count({ where: { userId: userA!.id, isDefault: true } })).toBe(1);

    // Delete the default; a replacement default is promoted; exactly one default remains.
    const addressCountBefore = await prisma.address.count({ where: { userId: userA!.id } });
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete" }).first().click();
    await expect(page.getByTestId("address-list").locator("li")).toHaveCount(1);
    expect(await prisma.address.count({ where: { userId: userA!.id } })).toBe(addressCountBefore - 1);
    expect(await prisma.address.count({ where: { userId: userA!.id, isDefault: true } })).toBe(1);

    // Default address shows on the account dashboard.
    await page.goto("/account");
    await expect(page.getByTestId("default-address-line")).toBeVisible();
  });

  test("AO: checkout prefills profile and default address for signed-in customers", async () => {
    await page.goto("/account/profile");
    await page.getByLabel("Full name").fill("Alpha Updated");
    await page.getByRole("button", { name: "Save changes" }).click();

    await resetCart();
    await addToCart();
    await page.goto("/checkout");
    await expect(page.getByTestId("place-order")).toBeEnabled({ timeout: 15_000 });
    await expect(page.getByLabel("Full name")).toHaveValue("Alpha Updated");
    await expect(page.getByLabel("Email", { exact: true })).toHaveValue(emailA);
    await expect(page.getByLabel("Phone", { exact: true })).toHaveValue("+1 555 010 0999");
    await expect(page.getByLabel("Address line 1")).toHaveValue("100 Alpha Street Updated");
    await expect(page.getByLabel("City")).toHaveValue("A-Town");
  });

  test("AQ: customer pages leak no private/internal fields", async () => {
    await page.goto(`/account/orders/${orderANumber}`);
    const detailHtml = await page.content();
    for (const secret of ["passwordHash", "costPrice", "lookupToken", "internalNote", "AuditLog", "AUTH_SECRET"]) {
      expect(detailHtml.toLowerCase()).not.toContain(secret.toLowerCase());
    }

    await page.goto("/account");
    const dashboardHtml = await page.content();
    for (const secret of ["passwordHash", "costPrice", "lookupToken"]) {
      expect(dashboardHtml.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });
});
