import { createHash, randomBytes } from "node:crypto";

/** 32 random bytes, base64url — suitable for one-time email links. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hash of a token, hex — the only form ever stored in the database. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
