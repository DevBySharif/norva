import { expect, test } from "@playwright/test";
import { hash } from "bcryptjs";
import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "../src/lib/db/prisma";
import { runId } from "./helpers/test-data";

const id = runId();
const slug = `phase5c-media-${id}`;
const email = `phase5c-customer-${id}@example.test`;
const password = "MediaTest-4A";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const uploadedUrls = new Set<string>();
test.describe.configure({ mode: "serial", timeout: 120_000 });

async function product() { return prisma.product.findUnique({ where: { slug }, include: { images: { orderBy: { position: "asc" } }, variants: { include: { inventory: true } } } }); }

test.afterAll(async () => {
  const current = await product();
  if (current) {
    current.images.forEach((image) => uploadedUrls.add(image.url));
    await prisma.cartItem.deleteMany({ where: { variant: { productId: current.id } } });
    await prisma.auditLog.deleteMany({ where: { entityId: current.id } });
    await prisma.product.delete({ where: { id: current.id } });
  }
  for (const url of uploadedUrls) if (url.startsWith("/api/media/product/")) await unlink(path.join(process.cwd(), ".media", "product", path.basename(url))).catch(() => undefined);
  await prisma.user.deleteMany({ where: { email } });
  await prisma.$disconnect();
});

test("admin uploads, previews, orders, publishes, and removes product media", async ({ page }) => {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  const brand = await prisma.brand.findFirstOrThrow({ where: { isActive: true } });
  await page.goto("/admin/products/new");
  await page.getByLabel("Name").fill(`Phase 5C Media ${id}`); await page.getByLabel("Slug").fill(slug); await page.getByLabel("Status").selectOption("ACTIVE"); await page.getByLabel("Category").selectOption(category.id); await page.getByLabel("Brand").selectOption(brand.id);
  await page.getByLabel("SKU").fill(`P5C-${id}`); await page.getByLabel("Regular price").fill("48.00"); await page.getByLabel("Quantity").fill("8"); await page.getByLabel("Low-stock threshold").fill("1");
  await page.getByRole("button", { name: "Create product" }).click(); await page.waitForURL(/\/admin\/products\/.+/);
  for (let index = 1; index <= 3; index++) {
    await page.getByLabel("Upload product image").setInputFiles({ name: `photo-${index}.png`, mimeType: "image/png", buffer: png });
    const media = page.locator("section", { has: page.getByRole("heading", { name: "Media" }) });
    await expect(media.getByRole("status")).toHaveText("Image uploaded.");
    await expect(media.locator("li")).toHaveCount(index);
  }
  let record = await product(); expect(record?.images).toHaveLength(3); record?.images.forEach((image) => uploadedUrls.add(image.url));
  expect(record?.images.map((image) => image.position)).toEqual([0, 1, 2]); expect(record?.images.filter((image) => image.isPrimary)).toHaveLength(1);
  for (const width of [375, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); await expect(page.getByLabel("Upload product image")).toBeAttached(); await expect(page.getByRole("button", { name: "Remove image 1" })).toBeVisible(); }
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.screenshot({ path: "test-results/phase5c-product-editor-1440.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 900 }); await page.screenshot({ path: "test-results/phase5c-product-editor-375.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(`/products/${slug}`); await expect(page.getByLabel("Product image thumbnails")).toBeVisible(); await expect(page.getByRole("button", { name: /Show image/ })).toHaveCount(3); await page.getByRole("button", { name: "Show image 2 of 3" }).click(); await expect(page.getByRole("button", { name: "Show image 2 of 3" })).toHaveAttribute("aria-pressed", "true");
  for (const width of [375, 768, 1024, 1440]) { await page.setViewportSize({ width, height: 900 }); expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true); await expect(page.getByTestId("product-gallery-main")).toBeVisible(); await expect(page.getByRole("button", { name: "Add to cart" })).toBeVisible(); }
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.screenshot({ path: "test-results/phase5c-product-gallery-1440.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 900 }); await page.screenshot({ path: "test-results/phase5c-product-gallery-375.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.goto(`/admin/products/${record!.id}`); await page.getByRole("button", { name: "Set image 3 as primary" }).click(); await expect(page.getByText("Primary image updated.")).toBeVisible();
  record = await product(); expect(record?.images[0].id).toBe(record?.images.find((image) => image.isPrimary)?.id); const primaryAfter = record?.images[0].url;
  await page.goto("/products"); const cardImage = page.getByRole("link", { name: new RegExp(`Phase 5C Media ${id}`) }).first().locator("img"); expect(decodeURIComponent(await cardImage.getAttribute("src") || "")).toContain(primaryAfter!); await page.goto(`/admin/products/${record!.id}`);
  await page.reload(); await expect(page.locator("li").first().getByText("Primary")).toBeVisible();
  await page.getByRole("button", { name: "Move image 1 right" }).click(); await expect(page.getByText("Image order updated.")).toBeVisible();
  record = await product(); expect(record?.images.map((image) => image.position)).toEqual([0, 1, 2]); expect(record?.images[1].url).toBe(primaryAfter);
  await page.getByRole("button", { name: "Remove image 1" }).click(); await expect(page.getByText("Image removed.")).toBeVisible();
  await page.reload(); await page.getByRole("button", { name: "Remove image 2" }).click(); await expect(page.getByText("Image removed.")).toBeVisible();
  record = await product(); expect(record?.images).toHaveLength(1); expect(record?.images[0].position).toBe(0); expect(record?.images[0].isPrimary).toBe(true);
  await page.goto(`/products/${slug}`); await expect(page.getByLabel("Product image thumbnails")).toHaveCount(0);
  await page.goto("/products"); await expect(page.getByRole("link", { name: new RegExp(`Phase 5C Media ${id}`) }).first()).toBeVisible();
});

test("upload rejects anonymous, customer, invalid, oversized, and over-limit requests without mutation", async ({ page, browser }) => {
  const current = await product(); expect(current).toBeTruthy(); const before = await prisma.productImage.count({ where: { productId: current!.id } });
  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const anonymousResponse = await anonymous.request.post(`/api/admin/products/${current!.id}/media`, { multipart: { image: { name: "photo.png", mimeType: "image/png", buffer: png } } });
  expect(anonymousResponse.status()).toBe(401); await anonymous.close();
  await prisma.user.create({ data: { email, name: "Phase 5C Customer", role: "CUSTOMER", emailVerifiedAt: new Date(), passwordHash: await hash(password, 10) } });
  const customer = await browser.newContext({ storageState: { cookies: [], origins: [] } }); const customerPage = await customer.newPage(); await customerPage.goto("/login"); await customerPage.getByLabel("Email", { exact: true }).fill(email); await customerPage.getByLabel("Password", { exact: true }).fill(password); await customerPage.getByRole("button", { name: "Sign in" }).click(); await customerPage.waitForURL(/\/account/);
  const customerResponse = await customer.request.post(`/api/admin/products/${current!.id}/media`, { multipart: { image: { name: "photo.png", mimeType: "image/png", buffer: png } } }); expect(customerResponse.status()).toBe(403); await customer.close();
  const invalid = await page.request.post(`/api/admin/products/${current!.id}/media`, { multipart: { image: { name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("bad") } } }); expect(invalid.status()).toBe(400); expect((await invalid.json()).message).toMatch(/JPEG/);
  const oversized = await page.request.post(`/api/admin/products/${current!.id}/media`, { multipart: { image: { name: "huge.png", mimeType: "image/png", buffer: Buffer.alloc(8 * 1024 * 1024 + 1, 0x89) } } }); expect(oversized.status()).toBe(400); expect((await oversized.json()).message).toMatch(/8 MB/);
  await prisma.productImage.createMany({ data: Array.from({ length: 7 }, (_, index) => ({ productId: current!.id, url: `/test/limit-${id}-${index}.png`, altText: "Limit test", position: index + 1, isPrimary: false })) });
  const overLimit = await page.request.post(`/api/admin/products/${current!.id}/media`, { multipart: { image: { name: "extra.png", mimeType: "image/png", buffer: png } } }); expect(overLimit.status()).toBe(409);
  expect(await prisma.productImage.count({ where: { productId: current!.id } })).toBe(8);
  await prisma.productImage.deleteMany({ where: { productId: current!.id, url: { startsWith: "/test/limit-" } } });
  expect(await prisma.productImage.count({ where: { productId: current!.id } })).toBe(before);
});
