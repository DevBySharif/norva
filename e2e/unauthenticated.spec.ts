import { test, expect } from "@playwright/test";
test("anonymous catalog routes redirect to login", async ({ page }) => { for (const path of ["/admin/categories", "/admin/brands", "/admin/products", "/admin/products/new"]) { await page.goto(path); await expect(page).toHaveURL(/\/admin\/login/); } });
