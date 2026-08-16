import { expect, test } from "@playwright/test";

test.use({ baseURL: "http://localhost:3000" });

test("Verify dev-demo-3d product", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/products/dev-demo-3d");
  
  const viewIn3dBtn = page.getByRole("button", { name: "View in 3D" });
  await expect(viewIn3dBtn).toBeVisible();
  
  await viewIn3dBtn.click();
  
  const viewer = page.getByTestId("product-model-viewer");
  await expect(viewer).toBeAttached();
  
  // Wait for loading text to disappear
  await expect(page.getByText("Loading 3D model…")).toBeHidden({ timeout: 10000 });
  
  await page.screenshot({ path: "test-results/3d-real-render-1440.png", fullPage: true });

  await page.setViewportSize({ width: 375, height: 900 });
  await page.screenshot({ path: "test-results/3d-real-render-375.png", fullPage: true });
});
