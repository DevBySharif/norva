import "server-only";
import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/db/prisma";
import { createPasswordResetTokenAndEnqueue, createVerificationTokenAndEnqueue } from "./auth-tokens";
import { buildPasswordResetLink, buildVerifyLink } from "./links";
import { markInlineDelivered, markInlineFailed } from "./outbox";
import { getEmailProvider } from "./provider";
import { isAuthEmailRateLimited } from "./rate-limit";
import { passwordResetTemplate, verifyEmailTemplate } from "./templates";
import { hashToken } from "./tokens";

export type AuthActionResult =
  | { ok: true; message?: string }
  | { ok: false; code: string; message: string; fieldErrors?: Record<string, string> };

const INVALID_OR_EXPIRED = "This link is invalid or has expired. Request a new one below.";

async function deliverInline(input: {
  outboxId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  metadata: Record<string, string>;
}): Promise<{ ok: boolean }> {
  const provider = getEmailProvider();
  try {
    await provider.send({ to: input.to, subject: input.subject, text: input.text, html: input.html, metadata: input.metadata });
    await markInlineDelivered(input.outboxId, provider.name);
    return { ok: true };
  } catch (error) {
    await markInlineFailed(input.outboxId, error);
    return { ok: false };
  }
}

/** Read-only preflight for the /verify-email landing page (no mutation). */
export async function inspectVerificationToken(token: string): Promise<"none" | "invalid" | "expired" | "valid"> {
  const trimmed = (token ?? "").trim();
  if (!trimmed) return "none";
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashToken(trimmed) } });
  if (!record) return "invalid";
  if (record.expiresAt.getTime() < Date.now()) return "expired";
  return "valid";
}

/** Consumes a one-time verification token and marks the account email verified. Idempotent. */
export async function verifyEmail(token: string): Promise<AuthActionResult> {
  const trimmed = (token ?? "").trim();
  if (!trimmed) return { ok: false, code: "invalid_token", message: INVALID_OR_EXPIRED };
  const tokenHash = hashToken(trimmed);
  const record = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  if (!record) return { ok: false, code: "invalid_token", message: INVALID_OR_EXPIRED };
  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.emailVerificationToken.delete({ where: { id: record.id } }).catch(() => {});
    return { ok: false, code: "expired_token", message: INVALID_OR_EXPIRED };
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: record.userId }, select: { id: true, email: true, emailVerifiedAt: true } });
    if (user && !user.emailVerifiedAt) {
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      await tx.auditLog.create({
        data: { action: "EMAIL_VERIFIED", entityType: "User", entityId: user.id, userId: user.id, metadata: { email: user.email } },
      });
    }
    await tx.emailVerificationToken.deleteMany({ where: { userId: record.userId } });
  });

  return { ok: true, message: "Your email has been verified. Thank you!" };
}

/** Sends a fresh verification email to an existing, unverified account. Throttled. */
export async function resendVerification(userId: string): Promise<AuthActionResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, code: "not_found", message: "Account not found." };
  if (user.emailVerifiedAt) return { ok: false, code: "already_verified", message: "Your email is already verified." };

  const limited = await isAuthEmailRateLimited({ eventType: "VERIFY_EMAIL", email: user.email });
  if (limited) {
    return { ok: false, code: "rate_limited", message: "A verification email was sent recently. Please wait a minute and try again." };
  }

  const created = await prisma.$transaction(async (tx) => createVerificationTokenAndEnqueue(tx, { userId: user.id, email: user.email }));
  const verifyUrl = buildVerifyLink(created.rawToken);
  const { subject, text, html } = verifyEmailTemplate({ verifyUrl, name: user.name });
  const delivered = await deliverInline({
    outboxId: created.outboxId,
    to: user.email,
    subject,
    text,
    html,
    metadata: { eventType: "VERIFY_EMAIL", email: user.email },
  });
  if (!delivered.ok) return { ok: false, code: "delivery_failed", message: "We couldn't send the email right now. Please try again in a moment." };
  return { ok: true, message: "A new verification link has been sent." };
}

/**
 * Starts a password reset for an email address. Always returns a generic success
 * so the endpoint cannot be used to enumerate registered accounts.
 */
export async function requestPasswordReset(email: string): Promise<AuthActionResult> {
  const GENERIC = "If an account exists with that email, a password reset link is on its way.";
  const normalized = (email ?? "").trim().toLowerCase();
  if (!normalized) return { ok: true, message: GENERIC };

  const limited = await isAuthEmailRateLimited({ eventType: "PASSWORD_RESET_REQUESTED", email: normalized });
  if (limited) return { ok: true, message: GENERIC };

  const user = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true, email: true, name: true, passwordHash: true } });
  if (user?.passwordHash) {
    const created = await prisma.$transaction(async (tx) => createPasswordResetTokenAndEnqueue(tx, { userId: user.id, email: user.email }));
    const resetUrl = buildPasswordResetLink(created.rawToken);
    const { subject, text, html } = passwordResetTemplate({ resetUrl });
    await deliverInline({
      outboxId: created.outboxId,
      to: user.email,
      subject,
      text,
      html,
      metadata: { eventType: "PASSWORD_RESET_REQUESTED", email: user.email },
    });
  }
  return { ok: true, message: GENERIC };
}

/** Consumes a one-time reset token, sets a new password, and revokes old sessions. */
export async function resetPassword(token: string, newPassword: string): Promise<AuthActionResult> {
  const trimmed = (token ?? "").trim();
  if (!trimmed) return { ok: false, code: "invalid_token", message: INVALID_OR_EXPIRED };
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    return { ok: false, code: "validation", message: "Password must be at least 8 characters.", fieldErrors: { newPassword: "At least 8 characters." } };
  }

  const tokenHash = hashToken(trimmed);
  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash }, include: { user: { select: { id: true, email: true, passwordHash: true } } } });
  if (!record) return { ok: false, code: "invalid_token", message: INVALID_OR_EXPIRED };
  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.passwordResetToken.delete({ where: { id: record.id } }).catch(() => {});
    return { ok: false, code: "expired_token", message: INVALID_OR_EXPIRED };
  }
  if (record.user.passwordHash && (await compare(newPassword, record.user.passwordHash))) {
    return { ok: false, code: "same_password", message: "That is your current password. Choose a different one." };
  }

  const newHash = await hash(newPassword, 12);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash: newHash, passwordChangedAt: new Date() } });
    await tx.passwordResetToken.deleteMany({ where: { userId: record.userId } });
    await tx.auditLog.create({
      data: { action: "PASSWORD_RESET_COMPLETED", entityType: "User", entityId: record.userId, metadata: { email: record.user.email } },
    });
  });

  return { ok: true, message: "Your password has been reset. Please sign in with your new password." };
}

/** Delivers the verification email captured during registration (inline, post-commit). */
export async function deliverVerificationEmail(input: { token: string; outboxId: string; email: string; name?: string | null }): Promise<void> {
  const verifyUrl = buildVerifyLink(input.token);
  const { subject, text, html } = verifyEmailTemplate({ verifyUrl, name: input.name });
  await deliverInline({
    outboxId: input.outboxId,
    to: input.email,
    subject,
    text,
    html,
    metadata: { eventType: "VERIFY_EMAIL", email: input.email },
  });
}
