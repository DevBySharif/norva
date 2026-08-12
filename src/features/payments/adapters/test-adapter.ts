import type { Prisma } from "@prisma/client";
import { type PaymentProviderAdapter, type PaymentInitializationResult, type PaymentValidationResult } from "../types";

export class TestPaymentProvider implements PaymentProviderAdapter {
  providerName = "TEST";

  async initiatePayment(opts: {
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
  }): Promise<PaymentInitializationResult> {
    // In a real provider, we'd make an HTTP request here.
    // For TEST, we simply return a local redirect URL that acts as the provider checkout page.
    const baseUrl = process.env.APP_URL || "http://localhost:3000";
    const providerReference = `TEST_SESS_${Date.now()}_${opts.orderNumber}`;
    
    const params = new URLSearchParams({
      orderNumber: opts.orderNumber,
      amount: opts.amount.toString(),
      currency: opts.currency,
      providerReference,
      successUrl: opts.successUrl,
      failUrl: opts.failUrl,
      cancelUrl: opts.cancelUrl,
      ipnUrl: opts.ipnUrl,
    });
    
    return {
      ok: true,
      redirectUrl: `${baseUrl}/api/test-payment-gateway?${params.toString()}`,
      providerReference,
    };
  }

  async verifyNotification(requestBody: unknown, requestHeaders: Record<string, string>): Promise<PaymentValidationResult> {
    // Expects a JSON body for TEST webhooks
    if (typeof requestBody !== "object" || !requestBody) {
      return { ok: false, message: "Invalid payload format" };
    }
    const data = requestBody as Record<string, unknown>;

    const statusMap: Record<string, "PAID" | "PENDING" | "FAILED" | "CANCELLED"> = {
      "SUCCESS": "PAID",
      "FAILED": "FAILED",
      "CANCELLED": "CANCELLED",
      "PENDING": "PENDING"
    };

    const status = statusMap[String(data.status)];
    if (!status) return { ok: false, message: "Invalid status" };

    if (data.signature !== "VALID_TEST_SIGNATURE") {
      return { ok: false, message: "Invalid signature" };
    }

    return {
      ok: true,
      status,
      amount: String(data.amount),
      currency: String(data.currency),
      merchantReference: String(data.merchantReference), // which is our orderNumber
      providerReference: String(data.providerReference),
      rawPayload: requestBody,
    };
  }

  async verifyCallback(queryParams: Record<string, string>): Promise<PaymentValidationResult> {
    // For TEST, we can just use the same logic if we pass everything in query
    // In SSLCOMMERZ, callback and IPN share similar validation via an HTTP request to the gateway.
    // Here we just read the query for the sandbox.
    const statusMap: Record<string, "PAID" | "PENDING" | "FAILED" | "CANCELLED"> = {
      "SUCCESS": "PAID",
      "FAILED": "FAILED",
      "CANCELLED": "CANCELLED",
      "PENDING": "PENDING"
    };

    const status = statusMap[String(queryParams.status)];
    if (!status) return { ok: false, message: "Invalid status in callback" };

    if (queryParams.signature !== "VALID_TEST_SIGNATURE") {
      return { ok: false, message: "Invalid signature in callback" };
    }

    return {
      ok: true,
      status,
      amount: String(queryParams.amount),
      currency: String(queryParams.currency),
      merchantReference: String(queryParams.merchantReference),
      providerReference: String(queryParams.providerReference),
      rawPayload: queryParams,
    };
  }
}
