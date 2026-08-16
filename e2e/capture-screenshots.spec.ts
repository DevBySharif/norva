import { expect, test } from "@playwright/test";

test.use({ baseURL: "http://127.0.0.1:3110" });

test("Capture Storefront Screenshots", async ({ page }) => {
  // --- Homepage ---
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/homepage-1440.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: "test-results/homepage-375.png", fullPage: true });

  // --- 3D Product before activation ---
  await page.goto("/products/dev-demo-3d");
  await page.waitForLoadState("networkidle");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/3d-product-before-1440.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: "test-results/3d-product-before-375.png", fullPage: true });

  // --- Variant Product ---
  await page.goto("/products/dev-demo-variant");
  await page.waitForLoadState("networkidle");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/variant-product-1440.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: "test-results/variant-product-375.png", fullPage: true });

  // --- Cart ---
  // Add an item to cart first
  await page.goto("/products/dev-demo-simple");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.waitForTimeout(1000);
  await page.goto("/cart");
  await page.waitForLoadState("networkidle");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/cart-1440.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: "test-results/cart-375.png", fullPage: true });
});
