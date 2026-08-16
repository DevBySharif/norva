import { expect, test } from "@playwright/test";
import { prisma } from "../src/lib/db/prisma";
import fs from "fs";

test.use({ storageState: "playwright/.auth/admin.json" });

test("Upload 3D model to demo product", async ({ page }) => {
  const product = await prisma.product.findUnique({ where: { slug: "dev-demo-3d" } });
  if (!product) throw new Error("Product not found");

  await page.goto(`/admin/products/${product.id}`);
  
  // Find the upload input
  const glbBuffer = fs.readFileSync("public/demo.glb");
  
  // Try to locate 'Upload product 3D model' or 'Replace product 3D model'
  const uploadLocator = page.getByLabel("Upload product 3D model");
  const replaceLocator = page.getByLabel("Replace product 3D model");
  
  if (await replaceLocator.isVisible()) {
      await replaceLocator.setInputFiles({ name: "demo.glb", mimeType: "model/gltf-binary", buffer: glbBuffer });
      await expect(page.getByText("3D model replaced.")).toBeVisible({ timeout: 10000 });
  } else {
      await uploadLocator.setInputFiles({ name: "demo.glb", mimeType: "model/gltf-binary", buffer: glbBuffer });
      await expect(page.getByText("3D model uploaded.")).toBeVisible({ timeout: 10000 });
  }
  
  // Take a screenshot of the admin
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "test-results/demo-admin-model-1440.png", fullPage: true });

  // Visit storefront
  await page.goto(`/products/dev-demo-3d`);
  await page.getByRole("button", { name: "View in 3D" }).click();
  await expect(page.getByTestId("product-model-viewer")).toBeAttached();
  
  await page.screenshot({ path: "test-results/demo-storefront-model-1440.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: "test-results/demo-storefront-model-375.png", fullPage: true });
});
