import { test as setup, expect } from "@playwright/test";
import { privateEnv } from "./helpers/env";
setup("authenticate real super admin", async ({ page }) => { await page.goto("/admin/login"); await page.getByLabel("Email").fill(privateEnv("DEV_ADMIN_EMAIL")); await page.getByLabel("Password").fill(privateEnv("DEV_ADMIN_PASSWORD")); await page.getByRole("button", { name: "Sign in" }).click(); await expect(page).toHaveURL(/\/admin$/); await expect(page.getByText("SUPER_ADMIN").first()).toBeVisible(); await page.context().storageState({ path: "playwright/.auth/admin.json" }); });
