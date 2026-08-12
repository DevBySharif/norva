import type { Prisma } from "@prisma/client";

export type PaymentInitializationResult =
  | { ok: true; redirectUrl: string; providerReference: string; metadata?: Record<string, unknown> }
  | { ok: false; message: string };

export type PaymentValidationResult =
  | { ok: true; status: "PAID" | "PENDING" | "FAILED" | "CANCELLED"; amount: string; currency: string; merchantReference: string; providerReference: string; rawPayload: unknown }
  | { ok: false; message: string; rawPayload?: unknown };

export interface PaymentProviderAdapter {
  providerName: string;
  initiatePayment(opts: {
    orderId: string;
    orderNumber: string;
    amount: Prisma.Decimal;
    currency: string;
    customerEmail: string;
    customerName: string;
    customerPhone?: string | null;
    successUrl: string;
    failUrl: string;
    cancelUrl: string;
    ipnUrl: string;
  }): Promise<PaymentInitializationResult>;

  verifyNotification(requestBody: unknown, requestHeaders: Record<string, string>): Promise<PaymentValidationResult>;
  verifyCallback(queryParams: Record<string, string>): Promise<PaymentValidationResult>;
}
