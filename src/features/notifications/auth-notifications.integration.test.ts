import { describe, expect, it, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { compare } from "bcryptjs";
import { registerCustomerCore } from "@/features/customers/service";
import {
  deliverVerificationEmail,
  inspectVerificationToken,
  requestPasswordReset,
  resendVerification,
  resetPassword,
  verifyEmail,
} from "@/features/notifications/email-verification";
import { createPasswordResetTokenAndEnqueue } from "@/features/notifications/auth-tokens";
import { hashToken } from "@/features/notifications/tokens";

const prisma = new PrismaClient();
const runId = crypto.randomBytes(4).toString("hex");
const password = "SecurePass-4B";
const emails = {
  verify: `auth-verify-${runId}@example.test`,
  throttle: `auth-throttle-${runId}@example.test`,
  reset: `auth-reset-${runId}@example.test`,
  expired: `auth-expired-${runId}@example.test`,
  inline: `auth-inline-${runId}@example.test`,
};
const userIds: string[] = [];

async function registerUser(email: string) {
  const result = await registerCustomerCore({ fullName: "Auth Fixture", email, password, confirmPassword: password });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("registration fixture failed");
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  userIds.push(user.id);
  return { user, verification: result.verification! };
}

afterAll(async () => {
  await prisma.notificationOutbox.deleteMany({ where: { email: { in: Object.values(emails) } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe("registration issues a hashed token + outbox intent", () => {
  it("stores only a token hash, never the raw token, and sets passwordChangedAt", async () => {
    const { user, verification } = await registerUser(emails.verify);
    expect(verification.token).toHaveLength(43); // 32 random bytes base64url

    const record = await prisma.emailVerificationToken.findUniqueOrThrow({ where: { tokenHash: hashToken(verification.token) } });
    expect(record.tokenHash).not.toBe(verification.token);
    expect(record.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(user.passwordChangedAt).toBeInstanceOf(Date);

    const outbox = await prisma.notificationOutbox.findFirstOrThrow({
      where: { eventType: "VERIFY_EMAIL", email: emails.verify },
      orderBy: { createdAt: "desc" },
    });
    expect(outbox.provider).toBe("inline");
    expect(outbox.status).toBe("PENDING");
    expect(JSON.stringify(outbox.payload)).toContain(record.id);
    expect(JSON.stringify(outbox.payload)).not.toContain(verification.token);
    expect(JSON.stringify(outbox.payload)).not.toContain("tokenHash");
  });
});

describe("verification link lifecycle", () => {
  it("verifies once, clears tokens, writes audit, and never replays", async () => {
    const { user, verification } = await registerUser(emails.throttle);
    expect(await inspectVerificationToken(verification.token)).toBe("valid");

    const result = await verifyEmail(verification.token);
    expect(result.ok).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.emailVerifiedAt).toBeInstanceOf(Date);
    expect(await prisma.emailVerificationToken.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.auditLog.findFirst({ where: { entityId: user.id, action: "EMAIL_VERIFIED" } })).toBeTruthy();

    const replay = await verifyEmail(verification.token);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.code).toBe("invalid_token");
  });

  it("rejects expired tokens", async () => {
    const { user, verification } = await registerUser(emails.expired);
    const record = await prisma.emailVerificationToken.findFirstOrThrow({ where: { userId: user.id } });
    await prisma.emailVerificationToken.update({ where: { id: record.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await inspectVerificationToken(verification.token)).toBe("expired");
    const result = await verifyEmail(verification.token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("expired_token");
  });
});

describe("resend verification is throttled", () => {
  it("sends fresh tokens up to the budget, then blocks bursts", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: emails.verify } });
    expect(user.emailVerifiedAt).toBeNull();

    expect((await resendVerification(user.id)).ok).toBe(true);
    expect((await resendVerification(user.id)).ok).toBe(true);

    const blocked = await resendVerification(user.id);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.code).toBe("rate_limited");

    // Registration + two resends = 3 rows; the blocked call added none.
    const rows = await prisma.notificationOutbox.count({ where: { eventType: "VERIFY_EMAIL", email: emails.verify } });
    expect(rows).toBe(3);
    expect(user.emailVerifiedAt).toBeNull();
  });
});

describe("password reset request does not leak account existence", () => {
  it("returns the same generic message for known and unknown emails", async () => {
    await registerUser(emails.reset);
    const known = await requestPasswordReset(emails.reset);
    const ghost = await requestPasswordReset(emails.inline);
    expect(known.ok).toBe(true);
    expect(ghost.ok).toBe(true);
    if (known.ok && ghost.ok) expect(known.message).toBe(ghost.message);

    const knownRows = await prisma.notificationOutbox.count({ where: { eventType: "PASSWORD_RESET_REQUESTED", email: emails.reset } });
    const ghostRows = await prisma.notificationOutbox.count({ where: { eventType: "PASSWORD_RESET_REQUESTED", email: emails.inline } });
    expect(knownRows).toBe(1);
    expect(ghostRows).toBe(0);
  });

  it("throttles repeated requests at the same budget without new rows", async () => {
    await requestPasswordReset(emails.reset);
    await requestPasswordReset(emails.reset);
    const rows = await prisma.notificationOutbox.count({ where: { eventType: "PASSWORD_RESET_REQUESTED", email: emails.reset } });
    expect(rows).toBe(3);
  });
});

describe("reset password", () => {
  it("rejects an invalid token", async () => {
    const result = await resetPassword("not-a-real-token-0000000000000000000000", "NewPass-1234");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid_token");
  });

  it("validates password strength", async () => {
    const result = await resetPassword("any-token", "short");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("validation");
      expect(result.fieldErrors?.newPassword).toBeDefined();
    }
  });

  it("rejects reusing the current password, then completes the reset and revokes the token", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { email: emails.reset } });
    const created = await prisma.$transaction(async (tx) =>
      createPasswordResetTokenAndEnqueue(tx, { userId: user.id, email: emails.reset })
    );
    const raw = created.rawToken;

    const same = await resetPassword(raw, password);
    expect(same.ok).toBe(false);
    if (!same.ok) expect(same.code).toBe("same_password");

    const before = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const newPassword = "BrandNewPass-1234";
    const result = await resetPassword(raw, newPassword);
    expect(result.ok).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(await compare(newPassword, after.passwordHash!)).toBe(true);
    expect(await compare(password, after.passwordHash!)).toBe(false);
    expect(after.passwordChangedAt!.getTime()).toBeGreaterThan(before.passwordChangedAt!.getTime());
    expect(await prisma.passwordResetToken.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.auditLog.findFirst({ where: { entityId: user.id, action: "PASSWORD_RESET_COMPLETED" } })).toBeTruthy();

    const replay = await resetPassword(raw, "AnotherNew-1234");
    expect(replay.ok).toBe(false);
  });
});

describe("inline delivery marks the outbox row delivered", () => {
  it("deliverVerificationEmail transitions PENDING -> SENT with the provider name", async () => {
    const { verification } = await registerUser(emails.inline);
    const row = await prisma.notificationOutbox.findFirstOrThrow({
      where: { eventType: "VERIFY_EMAIL", email: emails.inline },
      orderBy: { createdAt: "desc" },
    });
    await deliverVerificationEmail({ token: verification.token, outboxId: row.id, email: emails.inline, name: "Auth Fixture" });
    const after = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.status).toBe("SENT");
    expect(after.provider).toBe("dev");
    expect(after.sentAt).toBeInstanceOf(Date);
  });
});
