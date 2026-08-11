import { expect, test } from "@playwright/test";
test("admin login page loads", async ({ page }) => { await page.goto("/admin/login"); await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible(); await expect(page.getByLabel("Email")).toBeVisible(); });
