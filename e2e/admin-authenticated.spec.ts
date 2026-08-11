import { test, expect } from "@playwright/test";
test("saved admin session opens protected catalog pages", async ({ page }) => { for (const path of ["/admin", "/admin/categories", "/admin/brands"]) { await page.goto(path); await expect(page).not.toHaveURL(/\/admin\/login/); } });
