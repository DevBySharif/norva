import { expect, test, type Locator, type Page } from "@playwright/test";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/db/prisma";
import { runId } from "./helpers/test-data";

const id = runId();
const marker = `e2e-phase5b-${id}`;
const emailA = `${marker}-a@example.test`;
const emailB = `${marker}-b@example.test`;
const password = "SecurePass-5B";
const productSlug = `${marker}-product`;
const categorySlug = `${marker}-category`;

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/account$/);
}

async function expectNoPageOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

async function expectVisibleFocus(page: Page, selector: Locator) {
  await selector.focus();
  await expect(selector).toBeFocused();
  const style = await selector.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { boxShadow: computed.boxShadow, outline: computed.outlineStyle };
  });
  expect(style.boxShadow !== "none" || style.outline !== "none").toBe(true);
}

test("Phase 5B wishlist, reviews, moderation, privacy, and live dashboard", async ({ browser, page }) => {
  test.setTimeout(120_000);
  const passwordHash = await hash(password, 12);
  const [customerA, customerB] = await Promise.all([
    prisma.user.create({ data: { email: emailA, name: "Phase Five Alpha", role: "CUSTOMER", passwordHash } }),
    prisma.user.create({ data: { email: emailB, name: "Phase Five Bravo", role: "CUSTOMER", passwordHash } }),
  ]);
  const category = await prisma.category.create({ data: { name: marker, slug: categorySlug } });
  const product = await prisma.product.create({ data: { name: `Phase 5B Product ${id}`, slug: productSlug, sku: `${marker}-sku`, basePrice: 25, categoryId: category.id, status: "ACTIVE", variants: { create: { name: "Default", sku: `${marker}-variant`, price: 25, inventory: { create: { quantity: 20, reorderPoint: 2 } } } } }, include: { variants: true } });
  const contextA = await browser.newContext(); const contextB = await browser.newContext();
  const pageA = await contextA.newPage(); const pageB = await contextB.newPage();
  let orderId = "";

  try {
    await login(pageA, emailA); await login(pageB, emailB);

    await test.step("wishlist add, hydration, isolation, non-public filtering, and removal", async () => {
      await pageA.goto(`/products/${productSlug}`);
      await pageA.getByRole("button", { name: "Add to wishlist" }).click();
      await expect(pageA.getByRole("button", { name: "Remove from wishlist" })).toBeVisible();
      expect(await prisma.wishlistItem.count({ where: { productId: product.id, wishlist: { userId: customerA.id } } })).toBe(1);
      await pageA.reload();
      await expect(pageA.getByRole("button", { name: "Remove from wishlist" })).toBeVisible();
      await pageA.goto("/wishlist");
      await expect(pageA.getByText(product.name)).toBeVisible();
      await expect(pageA.getByRole("button", { name: "Remove from wishlist" })).toBeVisible();

      await pageB.goto(`/products/${productSlug}`);
      await pageB.getByRole("button", { name: "Add to wishlist" }).click();
      await expect(pageB.getByRole("button", { name: "Remove from wishlist" })).toBeVisible();
      expect(await prisma.wishlistItem.count({ where: { productId: product.id, wishlist: { userId: customerA.id } } })).toBe(1);
      expect(await prisma.wishlistItem.count({ where: { productId: product.id, wishlist: { userId: customerB.id } } })).toBe(1);

      await prisma.product.update({ where: { id: product.id }, data: { status: "DRAFT" } });
      await pageA.goto("/wishlist");
      await expect(pageA.getByText(product.name)).toHaveCount(0);
      await prisma.product.update({ where: { id: product.id }, data: { status: "ACTIVE" } });
      await pageA.goto("/wishlist");
      await pageA.getByRole("button", { name: "Remove from wishlist" }).click();
      await expect(pageA.getByText("Your wishlist is empty")).toBeVisible();
      await pageA.reload();
      await expect(pageA.getByText("Your wishlist is empty")).toBeVisible();
    });

    await test.step("review eligibility, create, edit, uniqueness, ownership, privacy, and rating", async () => {
      await pageA.goto(`/products/${productSlug}`);
      await expect(pageA.getByRole("heading", { name: "Write a review" })).toHaveCount(0);
      const order = await prisma.order.create({ data: { orderNumber: `${marker}-order`, email: emailA, userId: customerA.id, status: "DELIVERED", subtotal: 25, grandTotal: 25, shippingTotal: 0, taxTotal: 0, shippingAddress: { line1: "1 E2E St", city: "Dhaka", country: "BD" }, items: { create: { productId: product.id, variantId: product.variants[0].id, productName: product.name, sku: `${marker}-variant`, unitPrice: 25, quantity: 1, lineTotal: 25 } } } });
      orderId = order.id;
      await pageA.reload();
      await expect(pageA.getByRole("heading", { name: "Write a review" })).toBeVisible();
      await pageA.getByLabel("Rating from one to five stars").selectOption("5");
      await pageA.getByLabel("Title (optional)").fill(`Excellent ${id}`);
      await pageA.locator('textarea[name="body"]').fill(`A verified Phase 5B browser review ${id}.`);
      await pageA.getByRole("button", { name: "Save review" }).click();
      await expect(pageA.getByText("Review saved.")).toBeVisible();
      await pageA.reload();
      await expect(pageA.getByText("Verified Purchase")).toBeVisible();
      await expect(pageA.getByText(`Excellent ${id}`)).toBeVisible();
      await expect(pageA.getByText("★ 5.0 from 1 review")).toBeVisible();

      await pageA.getByLabel("Rating from one to five stars").selectOption("4");
      await pageA.getByLabel("Title (optional)").fill(`Edited ${id}`);
      await pageA.locator('textarea[name="body"]').fill(`Edited verified browser review ${id}.`);
      await pageA.getByRole("button", { name: "Save review" }).click();
      await pageA.reload();
      await expect(pageA.getByText(`Edited ${id}`)).toBeVisible();
      await expect(pageA.getByText("★ 4.0 from 1 review")).toBeVisible();
      expect(await prisma.review.count({ where: { productId: product.id, userId: customerA.id } })).toBe(1);

      await pageB.goto(`/products/${productSlug}`);
      await expect(pageB.getByRole("heading", { name: /Write a review|Edit your review/ })).toHaveCount(0);
      expect((await prisma.review.findFirstOrThrow({ where: { productId: product.id, userId: customerA.id } })).title).toBe(`Edited ${id}`);
      const html = await pageB.content();
      for (const secret of [emailA, customerA.id, order.id]) expect(html).not.toContain(secret);
    });

    await test.step("responsive and accessible Phase 5B surfaces at all required viewports", async () => {
      const viewports = [375, 768, 1024, 1440];
      const longReview = `Long content ${"unbrokenreviewtext".repeat(35)}`;
      await prisma.review.updateMany({ where: { productId: product.id, userId: customerA.id }, data: { body: longReview } });

      await pageA.goto(`/products/${productSlug}`);
      await pageA.getByRole("button", { name: "Add to wishlist" }).click();
      await expect(pageA.getByRole("button", { name: "Remove from wishlist" })).toBeVisible();

      for (const width of viewports) {
        await pageA.setViewportSize({ width, height: 900 });
        await pageA.goto("/wishlist");
        await expectNoPageOverflow(pageA);
        await expect(pageA.getByRole("heading", { name: "Wishlist" })).toBeVisible();
        const removeWishlist = pageA.getByRole("button", { name: "Remove from wishlist" });
        await expect(removeWishlist).toBeVisible();
        expect((await removeWishlist.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
        await expectVisibleFocus(pageA, removeWishlist);
        await expect(pageA.getByRole("link", { name: "My account" })).toBeVisible();
        if (width < 768) {
          const menu = pageA.getByRole("button", { name: "Open navigation" });
          await expect(menu).toBeVisible();
          await menu.click();
          await expect(pageA.getByRole("navigation", { name: "Mobile navigation" }).getByRole("link", { name: "Wishlist" })).toBeVisible();
          await menu.click();
        }

        await pageA.goto(`/products/${productSlug}`);
        await expectNoPageOverflow(pageA);
        await expect(pageA.getByRole("heading", { name: "Reviews" })).toBeVisible();
        await expect(pageA.getByText("★ 4.0 from 1 review")).toBeVisible();
        await expect(pageA.getByText("Verified Purchase")).toBeVisible();
        await expect(pageA.getByRole("article").getByText(longReview)).toBeVisible();
        await expect(pageA.getByLabel("4 out of 5 stars")).toBeVisible();
        await expect(pageA.getByLabel("Title (optional)")).toBeVisible();
        await expect(pageA.getByRole("textbox", { name: "Review", exact: true })).toBeVisible();
        const rating = pageA.getByLabel("Rating from one to five stars");
        await rating.focus();
        await expect(rating).toBeFocused();
        await pageA.keyboard.press("ArrowUp");
        await expect(rating).toHaveValue("3");
        const saveReview = pageA.getByRole("button", { name: "Save review" });
        await expect(saveReview).toBeVisible();
        expect((await saveReview.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
        await expect(pageA.getByRole("button", { name: "Delete review" })).toBeVisible();

        await page.setViewportSize({ width, height: 900 });
        await page.goto("/admin");
        await expectNoPageOverflow(page);
        await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
        await expect(page.getByText("Active products", { exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: "Recent orders" })).toBeVisible();
        if (width < 1024) {
          const adminMenu = page.getByRole("button", { name: "Open admin navigation" });
          await expect(adminMenu).toBeVisible();
          expect((await adminMenu.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
          await expectVisibleFocus(page, adminMenu);
          await adminMenu.click();
          await expect(page.getByRole("navigation", { name: "Admin navigation" }).getByRole("link", { name: "Reviews" })).toBeVisible();
          await adminMenu.click();
        } else {
          await expect(page.locator("aside").getByRole("link", { name: "Reviews" })).toBeVisible();
        }

        await page.goto("/admin/reviews");
        await expectNoPageOverflow(page);
        await expect(page.getByRole("heading", { name: "Reviews" })).toBeVisible();
        await expect(page.getByText("Approved", { exact: true })).toBeVisible();
        const moderation = page.getByRole("button", { name: `Hide review for ${product.name}` });
        await expect(moderation).toBeVisible();
        expect((await moderation.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(40);
        await expectVisibleFocus(page, moderation);
      }

      await pageA.setViewportSize({ width: 375, height: 900 });
      await pageA.goto("/wishlist");
      await pageA.getByRole("button", { name: "Remove from wishlist" }).click();
      await expect(pageA.getByText("Your wishlist is empty")).toBeVisible();
      for (const width of viewports) {
        await pageA.setViewportSize({ width, height: 900 });
        await pageA.goto("/wishlist");
        await expectNoPageOverflow(pageA);
        await expect(pageA.getByText("Your wishlist is empty")).toBeVisible();
        await expect(pageA.getByRole("link", { name: "Browse products" })).toBeVisible();
      }
    });

    await test.step("admin dashboard and moderation use live state", async () => {
      const [orders, customers, activeProducts] = await Promise.all([prisma.order.count(), prisma.user.count({ where: { role: "CUSTOMER" } }), prisma.product.count({ where: { status: "ACTIVE", deletedAt: null } })]);
      await page.goto("/admin");
      const metric = (label: string) => page.locator("section").first().locator("div", { has: page.getByText(label, { exact: true }) }).first();
      await expect(metric("Orders")).toContainText(orders.toLocaleString());
      await expect(metric("Customers")).toContainText(customers.toLocaleString());
      await expect(metric("Active products")).toContainText(activeProducts.toLocaleString());
      await expect(page.getByText(`#${marker}-order`)).toBeVisible();

      await page.goto("/admin/reviews");
      await expect(page.getByText(`Edited ${id}`)).toBeVisible();
      await page.getByRole("button", { name: `Hide review for ${product.name}` }).click();
      await expect(page.getByRole("button", { name: `Approve review for ${product.name}` })).toBeVisible();
      await pageA.goto(`/products/${productSlug}`);
      await expect(pageA.getByText(`Edited ${id}`)).toHaveCount(0);
      await expect(pageA.getByText("No reviews yet")).toBeVisible();
      await page.goto("/admin/reviews");
      await page.getByRole("button", { name: `Approve review for ${product.name}` }).click();
      await expect(page.getByRole("button", { name: `Hide review for ${product.name}` })).toBeVisible();
      await pageA.reload();
      await expect(pageA.getByText(`Edited ${id}`)).toBeVisible();
      await pageB.goto("/admin/reviews");
      await expect(pageB).toHaveURL(/\/admin\/login/);
    });
  } finally {
    await contextA.close(); await contextB.close();
    await prisma.review.deleteMany({ where: { productId: product.id } });
    await prisma.wishlistItem.deleteMany({ where: { productId: product.id } });
    await prisma.wishlist.deleteMany({ where: { userId: { in: [customerA.id, customerB.id] } } });
    if (orderId) await prisma.order.deleteMany({ where: { id: orderId } });
    await prisma.product.deleteMany({ where: { id: product.id } });
    await prisma.category.deleteMany({ where: { id: category.id } });
    await prisma.user.deleteMany({ where: { id: { in: [customerA.id, customerB.id] } } });
    expect(await prisma.user.count({ where: { email: { startsWith: marker } } })).toBe(0);
    expect(await prisma.product.count({ where: { slug: { startsWith: marker } } })).toBe(0);
  }
});
