import { expect, test } from "@playwright/test";
import { cleanupProductBySlug, disconnectE2EDatabase, findProductBySlug, seededCategoryAndBrand } from "./helpers/db";
import { runId } from "./helpers/test-data";

const id = runId();
const slug2x2 = `e2e-2x2-${id}`;
const slugSimpleToMulti = `e2e-simple-to-multi-${id}`;
const slugVisibility = `e2e-visibility-${id}`;
const slugNegative = `e2e-negative-${id}`;

test.afterAll(async () => {
  await cleanupProductBySlug(slug2x2);
  await cleanupProductBySlug(slugSimpleToMulti);
  await cleanupProductBySlug(slugVisibility);
  await cleanupProductBySlug(slugNegative);
  await disconnectE2EDatabase();
});

test("2x2 multi-variant product: creation, ID preservation, and selector E2E", async ({ page }) => {
  test.setTimeout(180_000);
  const [category, brand] = await seededCategoryAndBrand();
  expect(category).toBeTruthy();
  expect(brand).toBeTruthy();
  if (!category || !brand) throw new Error("Missing seeded category or brand.");

  // 1. Create 2x2 Product
  await page.goto("/admin/products/new");
  await page.getByLabel("Name").first().fill(`E2E 2x2 ${id}`);
  await page.getByLabel("Slug").first().fill(slug2x2);
  await page.getByLabel("Category").first().selectOption(category.id);
  await page.getByLabel("Brand").first().selectOption(brand.id);
  await page.getByLabel("SKU").first().fill(`2x2-base-${id}`);
  await page.getByLabel("Regular price").first().fill("50.00");
  await page.getByLabel("Quantity").first().fill("10");
  await page.getByLabel("Status").first().selectOption("ACTIVE");

  // Add Option 1: Color
  await page.getByPlaceholder("Option group name").first().fill("Color");
  await page.getByRole("button", { name: "Add option group" }).click();
  await page.getByPlaceholder("New value...").first().fill("Red");
  await page.getByRole("button", { name: "Add value" }).first().click();
  await page.getByPlaceholder("New value...").first().fill("Blue");
  await page.getByRole("button", { name: "Add value" }).first().click();

  // Add Option 2: Size
  await page.getByPlaceholder("Option group name").first().fill("Size");
  await page.getByRole("button", { name: "Add option group" }).click();
  await page.getByPlaceholder("New value...").nth(1).fill("S");
  await page.getByRole("button", { name: "Add value" }).nth(1).click();
  await page.getByPlaceholder("New value...").nth(1).fill("M");
  await page.getByRole("button", { name: "Add value" }).nth(1).click();

  // Now variants grid should be visible (4 variants)
  // Let's modify price for Red / S
  await page.getByRole("spinbutton", { name: "Price for Red / S", exact: true }).fill("55.00");
  await page.getByRole("spinbutton", { name: "Quantity for Red / S" }).fill("0");

  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("status")).toHaveText("Product created.");
  
  // 2. Assert DB state and collect IDs
  const created = await findProductBySlug(slug2x2);
  expect(created).toBeTruthy();
  expect(created?.options).toHaveLength(2);
  expect(created?.variants).toHaveLength(4);
  
  const variantIds = created!.variants.map(v => v.id);
  const inventoryIds = created!.variants.map(v => v.inventory?.id);
  
  expect(variantIds.length).toBe(4);
  expect(new Set(variantIds).size).toBe(4);
  
  // 3. Storefront Variant Selector E2E
  await page.goto(`/products/${slug2x2}`);
  await expect(page.getByRole("heading", { name: `E2E 2x2 ${id}` })).toBeVisible();
  
  await page.getByRole("button", { name: "Red", exact: true }).click();
  await page.getByRole("button", { name: "S", exact: true }).click();
  await expect(page.getByText("$55.00", { exact: true })).toBeVisible();
  await expect(page.getByText("Out of stock")).toBeVisible();
  
  await page.getByRole("button", { name: "M", exact: true }).click();
  await expect(page.getByText("$50.00", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("In stock")).toBeVisible();

  // 4. Add Option Value (preserve identity)
  await page.goto(`/admin/products/${created!.id}`);
  await page.getByPlaceholder("New value...").nth(1).fill("L");
  await page.getByRole("button", { name: "Add value" }).nth(1).click();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("status")).toHaveText("Product updated.");
  
  const updated = await findProductBySlug(slug2x2);
  expect(updated?.variants).toHaveLength(6);
  
  const newVariantIds = updated!.variants.map(v => v.id);
  const newInventoryIds = updated!.variants.map(v => v.inventory?.id);
  
  // Assert original 4 variants still exist exactly
  variantIds.forEach(id => expect(newVariantIds).toContain(id));
  inventoryIds.forEach(id => expect(newInventoryIds).toContain(id));
  
  // 6. MULTI_TO_SIMPLE block
  await page.goto(`/admin/products/${created!.id}`);
  // Click remove option for both
  await page.getByRole("button", { name: "Remove option" }).first().click();
  await page.getByRole("button", { name: "Remove option" }).first().click();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("status")).toHaveText("Cannot remove all options from a multi-variant product.");
});

test("SIMPLE_TO_MULTI identity preservation and Storefront Visibility", async ({ page }) => {
  const [category, brand] = await seededCategoryAndBrand();
  
  // 1. Create simple product
  await page.goto("/admin/products/new");
  await page.getByLabel("Name").first().fill(`Simple to Multi ${id}`);
  await page.getByLabel("Slug").first().fill(slugSimpleToMulti);
  await page.getByLabel("Category").first().selectOption(category!.id);
  await page.getByLabel("Brand").first().selectOption(brand!.id);
  await page.getByLabel("SKU").first().fill(`s2m-${id}`);
  await page.getByLabel("Regular price").first().fill("10.00");
  await page.getByLabel("Quantity").first().fill("5");
  await page.getByLabel("Status").first().selectOption("DRAFT");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("status")).toHaveText("Product created.");
  
  const simple = await findProductBySlug(slugSimpleToMulti);
  const defaultVariantId = simple!.variants[0].id;
  const defaultInventoryId = simple!.variants[0].inventory!.id;
  
  // Verify DRAFT visibility
  await page.goto(`/products/${slugSimpleToMulti}`);
  await expect(page.getByText("This page has moved on.")).toBeVisible();
  
  // 2. Add options
  await page.goto(`/admin/products/${simple!.id}`);
  await page.getByPlaceholder("Option group name").first().fill("Material");
  await page.getByRole("button", { name: "Add option group" }).click();
  await page.getByPlaceholder("New value...").first().fill("Wood");
  await page.getByRole("button", { name: "Add value" }).first().click();
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("status")).toHaveText("Product updated.");
  
  const multi = await findProductBySlug(slugSimpleToMulti);
  expect(multi?.variants).toHaveLength(1);
  expect(multi?.variants[0].id).toBe(defaultVariantId);
  expect(multi?.variants[0].inventory!.id).toBe(defaultInventoryId);
});

test("Negative atomicity", async ({ page }) => {
  const [category, brand] = await seededCategoryAndBrand();
  
  await page.goto("/admin/products/new");
  await page.getByLabel("Name").first().fill(`Negative ${id}`);
  await page.getByLabel("Slug").first().fill(slugNegative);
  await page.getByLabel("Category").first().selectOption(category!.id);
  await page.getByLabel("Brand").first().selectOption(brand!.id);
  await page.getByLabel("SKU").first().fill(`neg-${id}`);
  await page.getByLabel("Regular price").first().fill("10.00");
  await page.getByLabel("Quantity").first().fill("5");
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("status")).toHaveText("Product created.");
  
  const prod = await findProductBySlug(slugNegative);
  
  // Attempt to save with duplicate SKU
  await page.goto(`/admin/products/${prod!.id}`);
  await page.getByPlaceholder("Option group name").first().fill("Tier");
  await page.getByRole("button", { name: "Add option group" }).click();
  await page.getByPlaceholder("New value...").first().fill("Gold");
  await page.getByRole("button", { name: "Add value" }).first().click();
  await page.getByPlaceholder("New value...").first().fill("Silver");
  await page.getByRole("button", { name: "Add value" }).first().click();
  
  // Make SKUs duplicate
  await page.getByRole("textbox", { name: "SKU for Gold" }).fill(`dup-sku-${id}`);
  await page.getByRole("textbox", { name: "SKU for Silver" }).fill(`dup-sku-${id}`);
  
  await page.getByRole("button", { name: "Save product" }).click();
  await expect(page.getByRole("status")).toContainText("SKUs must be unique within product");
  
  const unchanged = await findProductBySlug(slugNegative);
  expect(unchanged?.options).toHaveLength(0);
  expect(unchanged?.variants).toHaveLength(1);
});
