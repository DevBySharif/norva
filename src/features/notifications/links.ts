import "server-only";
import { getAppBaseUrl } from "@/lib/env";

export function buildVerifyLink(token: string): string {
  return `${getAppBaseUrl()}/verify-email?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetLink(token: string): string {
  return `${getAppBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
}

export function buildGuestOrderLink(orderNumber: string, accessToken: string): string {
  return `${getAppBaseUrl()}/orders/${encodeURIComponent(orderNumber)}?access=${encodeURIComponent(accessToken)}`;
}
