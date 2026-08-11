import { expect, test } from "@playwright/test";
import { brandProductCount, cleanupBrandBySlug, countBrandsBySlug, disconnectE2EDatabase, findBrandBySlug, seededBrandWithProducts } from "./helpers/db";
import { runId } from "./helpers/test-data";

const id = runId();
const primaryName = `e2e-brand-primary-${id}`;
const otherName = `e2e-brand-other-${id}`;
const primarySlug = primaryName;
const otherSlug = otherName;

test.afterAll(async () => {
  await cleanupBrandBySlug(primarySlug);
  await cleanupBrandBySlug(otherSlug);
  await disconnectE2EDatabase();
});

test("authenticated brand CRUD and duplicate-slug validation", async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const createForm = () => page.locator("form").filter({ has: page.getByRole("heading", { name: "Create brand" }) });
  const editForm = () => page.locator("form").filter({ has: page.getByRole("heading", { name: "Edit brand" }) });
  const editRow = async (slug: string) => {
    await page.locator("tr", { hasText: slug }).first().getByRole("button", { name: "Edit" }).click();
    await expect(editForm()).toBeVisible();
  };

  await page.goto("/admin/brands");
  const seeded = await seededBrandWithProducts();
  expect(seeded).not.toBeNull();
  if (!seeded) throw new Error("Expected seeded brand with products.");
  const brandCount = await brandProductCount(seeded.id);
  await expect(page.locator("tr", { hasText: seeded.slug }).first().locator("td").nth(2)).toHaveText(`${brandCount} ${brandCount === 1 ? "product" : "products"}`);

  await createForm().getByLabel("Name").fill(primaryName);
  await createForm().getByLabel("Slug").fill(primarySlug);
  await createForm().locator('textarea[name="description"]').fill("Primary brand description");
  await createForm().getByLabel("Logo URL").fill("https://example.com/e2e-brand-logo.png");
  await createForm().getByLabel("SEO title").fill("Primary brand SEO title");
  await createForm().getByRole("button", { name: "Save brand" }).click();
  await expect(page.getByRole("status")).toHaveText("Brand saved.");
  await page.reload();
  await expect(page.locator("tr", { hasText: primarySlug }).first()).toBeVisible();
  const primary = await findBrandBySlug(primarySlug);
  expect(primary?.description).toBe("Primary brand description");
  expect(primary?.seoTitle).toBe("Primary brand SEO title");
  expect(primary?.logoUrl).toBe("https://example.com/e2e-brand-logo.png");
  const slugBeforeEdit = primary!.slug;

  await editRow(primarySlug);
  await expect(editForm().getByLabel("Name")).toHaveValue(primaryName);
  await expect(editForm().getByLabel("Slug")).toHaveValue(slugBeforeEdit);
  await expect(editForm().locator('textarea[name="description"]')).toHaveValue("Primary brand description");
  await editForm().getByLabel("Name").fill(`${primaryName}-edited`);
  await editForm().locator('textarea[name="description"]').fill("Updated primary brand description");
  await editForm().getByRole("button", { name: "Save brand" }).click();
  await expect(page.getByRole("status")).toHaveText("Brand saved.");
  await page.reload();
  await expect(page.locator("tr", { hasText: `${primaryName}-edited` }).first()).toBeVisible();
  const editedPrimary = await findBrandBySlug(primarySlug);
  expect(editedPrimary?.name).toBe(`${primaryName}-edited`);
  expect(editedPrimary?.description).toBe("Updated primary brand description");
  expect(editedPrimary?.slug).toBe(slugBeforeEdit);

  await editRow(primarySlug);
  await editForm().locator('textarea[name="description"]').fill("Unsaved brand edit");
  await page.getByRole("button", { name: "Cancel edit" }).click();
  await editRow(primarySlug);
  await expect(editForm().locator('textarea[name="description"]')).toHaveValue("Updated primary brand description");
  await page.getByRole("button", { name: "Cancel edit" }).click();

  await createForm().getByLabel("Name").fill(`${primaryName}-duplicate`);
  await createForm().getByLabel("Slug").fill(primarySlug);
  await createForm().getByRole("button", { name: "Save brand" }).click();
  await expect(page.getByRole("status")).toHaveText("This brand slug is already in use.");
  expect(await countBrandsBySlug(primarySlug)).toBe(1);

  await createForm().getByLabel("Name").fill(otherName);
  await createForm().getByLabel("Slug").fill(otherSlug);
  await createForm().locator('textarea[name="description"]').fill("Other brand description");
  await createForm().getByRole("button", { name: "Save brand" }).click();
  await expect(page.getByRole("status")).toHaveText("Brand saved.");
  await page.reload();

  await editRow(primarySlug);
  await page.getByRole("button", { name: "Cancel edit" }).click();
  await editRow(otherSlug);
  await expect(editForm().getByLabel("Name")).toHaveValue(otherName);
  await page.getByRole("button", { name: "Cancel edit" }).click();

  await editRow(otherSlug);
  await editForm().getByLabel("Slug").fill(primarySlug);
  await editForm().getByRole("button", { name: "Save brand" }).click();
  await expect(page.getByRole("status")).toHaveText("This brand slug is already in use.");
  expect((await findBrandBySlug(otherSlug))?.slug).toBe(otherSlug);
  expect(await countBrandsBySlug(primarySlug)).toBe(1);
  await page.getByRole("button", { name: "Cancel edit" }).click();

  await editRow(otherSlug);
  await editForm().getByLabel("Active").uncheck();
  await editForm().getByRole("button", { name: "Save brand" }).click();
  await expect(page.getByRole("status")).toHaveText("Brand saved.");
  await page.reload();
  expect((await findBrandBySlug(otherSlug))?.isActive).toBe(false);
  expect(pageErrors).toEqual([]);
});
