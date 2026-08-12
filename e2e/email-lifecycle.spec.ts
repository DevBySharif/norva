import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/db/prisma";
import { runId } from "./helpers/test-data";
import { emailsTo, latestEmailTo, linkFromText } from "./helpers/email-capture";

const id = runId();
const password = "SecurePass-4B";
const newPassword = "BrandNewPass-4B";
const emails = {
  verify: `notif-verify-${id}@example.test`,
  throttle: `notif-throttle-${id}@example.test`,
  reset: `notif-reset-${id}@example.test`,
  reset2: `notif-reset2-${id}@example.test`,
  ghost: `notif-ghost-${id}@example.test`,
};
const usersToCleanup = new Set<string>();

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("Phase 4B Email notifications (customer)", () => {
  let page: Page;

  async function register(email: string, name: string) {
    await page.goto("/register");
    await page.getByLabel("Full name").fill(name);
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel(/^Phone/).fill("");
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Confirm password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/account$/);
  }

  async function logout() {
    await page.goto("/account");
    await page.getByRole("button", { name: "Sign out" }).click();
    await page.waitForURL((url) => url.pathname === "/");
  }

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    for (const email of Object.values(emails)) {
      await prisma.notificationOutbox.deleteMany({ where: { email } });
    }
    const staleUsers = await prisma.user.findMany({ where: { email: { in: Object.values(emails) } }, select: { id: true } });
    const userIds = staleUsers.map((u) => u.id);
    if (userIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.emailVerificationToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
  });

  test.afterAll(async () => {
    for (const email of Object.values(emails)) {
      await prisma.notificationOutbox.deleteMany({ where: { email } });
    }
    const audits = await prisma.auditLog.findMany({ where: { userId: { in: [...usersToCleanup] } }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { id: { in: audits.map((a) => a.id) } } });
    await prisma.user.deleteMany({ where: { id: { in: [...usersToCleanup] } } });
    await page.close();
  });

  test("NB1: registration sends an inline verification email and shows the account banner", async () => {
    await register(emails.verify, "Notify Verify");

    const banner = page.getByTestId("verification-banner");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(emails.verify);

    // The email is written to the capture file before the register action resolves.
    await expect.poll(async () => emailsTo(emails.verify).length).toBeGreaterThanOrEqual(1);
    const email = latestEmailTo(emails.verify);
    expect(email!.subject).toMatch(/Verify your email/);
    const verifyUrl = linkFromText(email!.text, "/verify-email");
    expect(verifyUrl).toMatch(/\/verify-email\?token=[^&]+/);

    const user = await prisma.user.findUnique({ where: { email: emails.verify } });
    usersToCleanup.add(user!.id);
    expect(user!.role).toBe("CUSTOMER");
    expect(user!.emailVerifiedAt).toBeNull();

    const outbox = await prisma.notificationOutbox.findFirstOrThrow({ where: { eventType: "VERIFY_EMAIL", email: emails.verify }, orderBy: { createdAt: "desc" } });
    expect(outbox.status).toBe("SENT");
    expect(outbox.provider).toBe("dev");
    // The raw token must never be serialized anywhere.
    const rawToken = decodeURIComponent(verifyUrl!.split("token=")[1]!);
    expect(JSON.stringify(outbox.payload)).not.toContain(rawToken);
  });

  test("NB2: verifying from the email link verifies the account and clears the banner", async () => {
    const email = latestEmailTo(emails.verify)!;
    const verifyUrl = linkFromText(email.text, "/verify-email")!;

    await page.goto(verifyUrl);
    await page.getByRole("button", { name: "Verify my email" }).click();
    await expect(page.getByTestId("verify-success")).toBeVisible();

    const user = await prisma.user.findUnique({ where: { email: emails.verify } });
    expect(user!.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await prisma.emailVerificationToken.count({ where: { userId: user!.id } })).toBe(0);
    expect(await prisma.auditLog.findFirst({ where: { userId: user!.id, action: "EMAIL_VERIFIED" } })).toBeTruthy();

    // Banner disappears for a verified account.
    await page.goto("/account");
    await expect(page.getByTestId("verification-banner")).toHaveCount(0);
  });

  test("NB3: resend from the banner is throttled at the budget", async () => {
    await register(emails.throttle, "Notify Throttle");
    const user = await prisma.user.findUnique({ where: { email: emails.throttle } });
    usersToCleanup.add(user!.id);

    const banner = page.getByTestId("verification-banner");
    await expect(banner).toBeVisible();

    await banner.getByRole("button", { name: "Resend verification email" }).click();
    await expect(page.getByTestId("resend-message")).toBeVisible();
    await banner.getByRole("button", { name: "Resend verification email" }).click();
    await expect(page.getByTestId("resend-message")).toBeVisible();

    // Third request exceeds the budget (registration + 2 resends = 3).
    await banner.getByRole("button", { name: "Resend verification email" }).click();
    await expect(page.getByTestId("resend-error")).toBeVisible();
    await expect(page.getByTestId("resend-error")).toContainText(/wait|recently/i);

    const rows = await prisma.notificationOutbox.count({ where: { eventType: "VERIFY_EMAIL", email: emails.throttle } });
    expect(rows).toBe(3);
    expect(emailsTo(emails.throttle).length).toBe(3);
  });

  test("NB4: forgot password does not reveal whether an account exists", async () => {
    // Register the reset account first
    await register(emails.reset, "Notify Reset");
    const user = await prisma.user.findUnique({ where: { email: emails.reset } });
    usersToCleanup.add(user!.id);

    // Sign out, then start a reset for a known and an unknown account from a fresh page.
    await logout();
    await page.goto("/forgot-password");

    await page.getByLabel("Email", { exact: true }).fill(emails.ghost);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByTestId("forgot-success")).toBeVisible();
    const unknownMessage = (await page.getByTestId("forgot-success").textContent())!.trim();

    await page.goto("/forgot-password");
    await page.getByLabel("Email", { exact: true }).fill(emails.reset);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByTestId("forgot-success")).toBeVisible();
    const knownMessage = (await page.getByTestId("forgot-success").textContent())!.trim();

    expect(knownMessage).toBe(unknownMessage);

    const knownRows = await prisma.notificationOutbox.count({ where: { eventType: "PASSWORD_RESET_REQUESTED", email: emails.reset } });
    const ghostRows = await prisma.notificationOutbox.count({ where: { eventType: "PASSWORD_RESET_REQUESTED", email: emails.ghost } });
    expect(knownRows).toBe(1);
    expect(ghostRows).toBe(0);
    expect(emailsTo(emails.ghost).length).toBe(0);
  });

  test("NB5: resetting the password revokes the old session and works with the new password", async () => {
    // Register the reset account (a session exists afterwards), then request a reset.
    await register(emails.reset2, "Notify Reset");
    const resetUser = await prisma.user.findUnique({ where: { email: emails.reset2 } });
    usersToCleanup.add(resetUser!.id);

    await page.goto("/forgot-password");
    await page.getByLabel("Email", { exact: true }).fill(emails.reset2);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByTestId("forgot-success")).toBeVisible();

    const resetEmail = latestEmailTo(emails.reset2, (e) => /Reset your password/.test(e.subject));
    expect(resetEmail).toBeTruthy();
    const resetUrl = linkFromText(resetEmail!.text, "/reset-password");
    expect(resetUrl).toMatch(/\/reset-password\?token=[^&]+/);

    // Complete the reset in the same tab.
    await page.goto(resetUrl!);
    await page.getByLabel("New password").fill(newPassword);
    await page.getByLabel("Confirm password").fill(newPassword);
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByTestId("reset-success")).toBeVisible();

    // The session was minted before the password change → revoked.
    await page.goto("/account");
    await expect(page).toHaveURL(/\/login/);

    // Old password rejected; new password signs in.
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(emails.reset2);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByTestId("login-error")).toBeVisible();

    await page.reload();
    await page.getByLabel("Email", { exact: true }).fill(emails.reset2);
    await page.getByLabel("Password", { exact: true }).fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/account$/);

    const after = await prisma.user.findUnique({ where: { email: emails.reset2 } });
    expect(after!.passwordHash).not.toBe(resetUser!.passwordHash);
    expect(await prisma.passwordResetToken.count({ where: { userId: resetUser!.id } })).toBe(0);
  });
});
