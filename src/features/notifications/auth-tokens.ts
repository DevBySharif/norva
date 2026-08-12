import { Prisma } from "@prisma/client";
import { generateToken, hashToken } from "./tokens";
import { enqueueAuthNotification } from "./outbox";

/** Verification links stay valid for one day. */
export const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
/** Password reset links stay valid for one day. */
export const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Creates a fresh one-time verification token (hash stored only) and enqueues
 * the outbox ledger row inside the caller's transaction. The RAW token is
 * returned to the caller transiently and is never written to the database.
 */
export async function createVerificationTokenAndEnqueue(
  tx: Prisma.TransactionClient,
  input: { userId: string; email: string; path?: "/verify-email" },
): Promise<{ rawToken: string; outboxId: string }> {
  await tx.emailVerificationToken.deleteMany({ where: { userId: input.userId } });
  const rawToken = generateToken();
  const record = await tx.emailVerificationToken.create({
    data: {
      userId: input.userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
    },
  });
  const { id: outboxId } = await enqueueAuthNotification(tx, {
    eventType: "VERIFY_EMAIL",
    email: input.email,
    userId: input.userId,
    tokenRecordId: record.id,
    path: input.path ?? "/verify-email",
  });
  return { rawToken, outboxId };
}

/**
 * Creates a fresh one-time password reset token (hash stored only) and enqueues
 * the outbox ledger row inside the caller's transaction. The RAW token is
 * returned to the caller transiently and is never written to the database.
 */
export async function createPasswordResetTokenAndEnqueue(
  tx: Prisma.TransactionClient,
  input: { userId: string; email: string; path?: "/reset-password" },
): Promise<{ rawToken: string; outboxId: string }> {
  await tx.passwordResetToken.deleteMany({ where: { userId: input.userId } });
  const rawToken = generateToken();
  const record = await tx.passwordResetToken.create({
    data: {
      userId: input.userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });
  const { id: outboxId } = await enqueueAuthNotification(tx, {
    eventType: "PASSWORD_RESET_REQUESTED",
    email: input.email,
    userId: input.userId,
    tokenRecordId: record.id,
    path: input.path ?? "/reset-password",
  });
  return { rawToken, outboxId };
}
