import { expect, test } from "@playwright/test";
import { categoryProductCount, cleanupCategoryBySlug, countCategoriesBySlug, disconnectE2EDatabase, findCategoryBySlug, seededCategoryWithProducts } from "./helpers/db";
import { runId } from "./helpers/test-data";

const id = runId();
const parentName = `e2e-category-parent-${id}`;
const childName = `e2e-category-child-${id}`;
const otherName = `e2e-category-other-${id}`;
const parentSlug = parentName;
const childSlug = childName;
const otherSlug = otherName;

test.afterAll(async () => {
  await cleanupCategoryBySlug(parentSlug);
  await cleanupCategoryBySlug(otherSlug);
  await disconnectE2EDatabase();
});

test("authenticated category CRUD and validation boundaries", async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const createForm = () => page.locator("form").filter({ has: page.getByRole("heading", { name: "Create category" }) });
  const editForm = () => page.locator("form").filter({ has: page.getByRole("heading", { name: "Edit category" }) });
  const editRow = async (slug: string) => {
    const row = page.locator("tr").filter({ has: page.locator("td:nth-child(2)", { hasText: new RegExp(`^${slug}$`) }) });
    await row.getByRole("button", { name: "Edit" }).click();
    await expect(editForm()).toBeVisible();
  };

  await page.goto("/admin/categories");
  const seeded = await seededCategoryWithProducts();
  expect(seeded).not.toBeNull();
  if (!seeded) throw new Error("Expected seeded category with products.");
  const seededRow = page.locator("tr", { hasText: seeded.slug }).first();
  const seededCount = await categoryProductCount(seeded.id);
  await expect(seededRow.locator("td").nth(2)).toHaveText(`${seededCount} ${seededCount === 1 ? "product" : "products"}`);

  await createForm().getByLabel("Name").fill(parentName);
  await createForm().getByLabel("Slug").fill(parentSlug);
  await createForm().locator('textarea[name="description"]').fill("Parent category description");
  await createForm().getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("status")).toHaveText("Category saved.");
  await page.reload();
  await expect(page.locator("tr", { hasText: parentSlug }).first()).toBeVisible();
  const parent = await findCategoryBySlug(parentSlug);
  expect(parent?.parentId).toBeNull();

  await createForm().getByLabel("Name").fill(childName);
  await createForm().getByLabel("Slug").fill(childSlug);
  await createForm().locator('select[name="parentId"]').selectOption(parent!.id);
  await createForm().locator('textarea[name="description"]').fill("Child category description");
  await createForm().getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("status")).toHaveText("Category saved.");
  await page.reload();
  await expect(page.locator("tr", { hasText: childSlug }).first()).toContainText(parentName);
  const child = await findCategoryBySlug(childSlug);
  expect(child?.parentId).toBe(parent!.id);
  const slugBeforeEdit = child!.slug;

  await editRow(childSlug);
  await expect(editForm().getByLabel("Name")).toHaveValue(childName);
  await expect(editForm().getByLabel("Slug")).toHaveValue(slugBeforeEdit);
  await editForm().getByLabel("Name").fill(`${childName}-edited`);
  await editForm().locator('textarea[name="description"]').fill("Updated child category description");
  await editForm().getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("status")).toHaveText("Category saved.");
  await page.reload();
  await expect(page.locator("tr", { hasText: `${childName}-edited` }).first()).toBeVisible();
  const editedChild = await findCategoryBySlug(childSlug);
  expect(editedChild?.name).toBe(`${childName}-edited`);
  expect(editedChild?.description).toBe("Updated child category description");
  expect(editedChild?.slug).toBe(slugBeforeEdit);

  await editRow(childSlug);
  await editForm().locator('textarea[name="description"]').fill("Unsaved edit");
  await page.getByRole("button", { name: "Cancel edit" }).click();
  await editRow(childSlug);
  await expect(editForm().locator('textarea[name="description"]')).toHaveValue("Updated child category description");
  await page.getByRole("button", { name: "Cancel edit" }).click();

  await editRow(childSlug);
  await page.getByRole("button", { name: "Cancel edit" }).click();
  await editRow(parentSlug);
  await expect(editForm().getByLabel("Name")).toHaveValue(parentName);
  await page.getByRole("button", { name: "Cancel edit" }).click();

  await createForm().getByLabel("Name").fill(`${parentName}-duplicate`);
  await createForm().getByLabel("Slug").fill(parentSlug);
  await createForm().getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("status")).toHaveText("This category slug is already in use.");
  expect(await countCategoriesBySlug(parentSlug)).toBe(1);

  await createForm().getByLabel("Name").fill(otherName);
  await createForm().getByLabel("Slug").fill(otherSlug);
  await createForm().getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("status")).toHaveText("Category saved.");
  await page.reload();
  await editRow(otherSlug);
  await editForm().getByLabel("Slug").fill(parentSlug);
  await editForm().getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("status")).toHaveText("This category slug is already in use.");
  expect((await findCategoryBySlug(otherSlug))?.slug).toBe(otherSlug);
  expect(await countCategoriesBySlug(parentSlug)).toBe(1);
  await page.getByRole("button", { name: "Cancel edit" }).click();

  await editRow(parentSlug);
  await editForm().locator('select[name="parentId"]').evaluate((select, value) => select.append(new Option("Self", value)), parent!.id);
  await editForm().locator('select[name="parentId"]').selectOption(parent!.id);
  await editForm().getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("status")).toHaveText("A category cannot be its own parent.");
  expect((await findCategoryBySlug(parentSlug))?.parentId).toBeNull();

  await editForm().locator('select[name="parentId"]').selectOption(editedChild!.id);
  await editForm().getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("status")).toHaveText("A category cannot use one of its descendants as parent.");
  expect((await findCategoryBySlug(parentSlug))?.parentId).toBeNull();

  await editForm().locator('select[name="parentId"]').evaluate((select) => select.append(new Option("Missing", "missing-parent-id")));
  await editForm().locator('select[name="parentId"]').selectOption("missing-parent-id");
  await editForm().getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("status")).toHaveText("Unable to save category.");
  expect((await findCategoryBySlug(parentSlug))?.parentId).toBeNull();
  await page.getByRole("button", { name: "Cancel edit" }).click();

  await editRow(otherSlug);
  await editForm().getByLabel("Active").uncheck();
  await editForm().getByRole("button", { name: "Save category" }).click();
  await expect(page.getByRole("status")).toHaveText("Category saved.");
  await page.reload();
  expect((await findCategoryBySlug(otherSlug))?.isActive).toBe(false);
  expect(pageErrors).toEqual([]);
});
