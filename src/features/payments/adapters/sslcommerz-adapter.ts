import type { Prisma } from "@prisma/client";
import { type PaymentProviderAdapter, type PaymentInitializationResult, type PaymentValidationResult } from "../types";

export class SSLCommerzPaymentProvider implements PaymentProviderAdapter {
  providerName = "SSLCOMMERZ";

  private get storeId(): string {
    return process.env.SSLCOMMERZ_STORE_ID || "";
  }

  private get storePasswd(): string {
    return process.env.SSLCOMMERZ_STORE_PASSWORD || "";
  }

  private get isSandbox(): boolean {
    return process.env.SSLCOMMERZ_SANDBOX === "true";
  }

  private get initUrl(): string {
    return this.isSandbox
      ? "https://sandbox.sslcommerz.com/gwprocess/v4/api.php"
      : "https://securepay.sslcommerz.com/gwprocess/v4/api.php";
  }

  private get validationUrl(): string {
    return this.isSandbox
      ? "https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php"
      : "https://securepay.sslcommerz.com/validator/api/validationserverAPI.php";
  }

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
    if (!this.storeId || !this.storePasswd) {
      return { ok: false, message: "SSLCOMMERZ is not configured." };
    }

    const providerReference = `SSLC_${Date.now()}_${opts.orderNumber}`;

    const form = new URLSearchParams();
    form.append("store_id", this.storeId);
    form.append("store_passwd", this.storePasswd);
    form.append("total_amount", opts.amount.toString());
    form.append("currency", opts.currency);
    form.append("tran_id", providerReference);
    form.append("success_url", opts.successUrl);
    form.append("fail_url", opts.failUrl);
    form.append("cancel_url", opts.cancelUrl);
    form.append("ipn_url", opts.ipnUrl);
    
    // Customer info (required by SSLCommerz)
    form.append("cus_name", opts.customerName);
    form.append("cus_email", opts.customerEmail);
    form.append("cus_add1", "N/A"); // Defaulting since we might not have it in the strict format
    form.append("cus_city", "N/A");
    form.append("cus_state", "N/A");
    form.append("cus_postcode", "N/A");
    form.append("cus_country", "N/A");
    form.append("cus_phone", opts.customerPhone || "01700000000");

    // Shipping info (required by SSLCommerz)
    form.append("shipping_method", "NO");
    form.append("num_of_item", "1");
    form.append("product_name", "Order " + opts.orderNumber);
    form.append("product_category", "Ecommerce");
    form.append("product_profile", "general");

    try {
      const response = await fetch(this.initUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      });

      const data = await response.json() as Record<string, unknown>;

      if (data.status === "SUCCESS" && typeof data.GatewayPageURL === "string") {
        return {
          ok: true,
          redirectUrl: data.GatewayPageURL,
          providerReference,
          metadata: { session_key: data.sessionkey },
        };
      }

      return { ok: false, message: (data.failedreason as string) || "Failed to initialize SSLCOMMERZ payment." };
    } catch (error) {
      return { ok: false, message: "Network error initializing payment." };
    }
  }

  private async validateTransaction(valId: string): Promise<PaymentValidationResult> {
    const url = new URL(this.validationUrl);
    url.searchParams.append("val_id", valId);
    url.searchParams.append("store_id", this.storeId);
    url.searchParams.append("store_passwd", this.storePasswd);
    url.searchParams.append("v", "1");
    url.searchParams.append("format", "json");

    try {
      const response = await fetch(url.toString(), { method: "GET" });
      const data = await response.json() as Record<string, unknown>;

      if (data.status === "VALID" || data.status === "VALIDATED") {
        return {
          ok: true,
          status: "PAID",
          amount: String(data.amount),
          currency: String(data.currency),
          merchantReference: String(data.tran_id),
          providerReference: String(data.bank_tran_id),
          rawPayload: data,
        };
      }

      return { ok: false, message: "Validation failed with SSLCOMMERZ", rawPayload: data };
    } catch (error) {
      return { ok: false, message: "Network error validating payment." };
    }
  }

  async verifyNotification(requestBody: unknown, _requestHeaders: Record<string, string>): Promise<PaymentValidationResult> {
    const data = requestBody as Record<string, unknown>;
    
    // IPN sends status = VALID if successful. We MUST validate via val_id.
    if (data.status === "VALID" && typeof data.val_id === "string") {
      return this.validateTransaction(data.val_id);
    }
    
    if (data.status === "FAILED") {
      return {
        ok: true,
        status: "FAILED",
        amount: String(data.amount),
        currency: String(data.currency),
        merchantReference: String(data.tran_id),
        providerReference: String(data.bank_tran_id),
        rawPayload: data,
      };
    }

    if (data.status === "CANCELLED") {
      return {
        ok: true,
        status: "CANCELLED",
        amount: String(data.amount),
        currency: String(data.currency),
        merchantReference: String(data.tran_id),
        providerReference: String(data.bank_tran_id),
        rawPayload: data,
      };
    }

    return { ok: false, message: "Invalid or unrecognized IPN status", rawPayload: data };
  }

  async verifyCallback(queryParams: Record<string, string>): Promise<PaymentValidationResult> {
    // The browser redirect (success) behaves similarly, we still need to validate using val_id.
    if (queryParams.status === "VALID" && typeof queryParams.val_id === "string") {
      return this.validateTransaction(queryParams.val_id);
    }

    if (queryParams.status === "FAILED") {
      return {
        ok: true,
        status: "FAILED",
        amount: String(queryParams.amount),
        currency: String(queryParams.currency),
        merchantReference: String(queryParams.tran_id),
        providerReference: String(queryParams.bank_tran_id),
        rawPayload: queryParams,
      };
    }

    if (queryParams.status === "CANCELLED") {
      return {
        ok: true,
        status: "CANCELLED",
        amount: String(queryParams.amount),
        currency: String(queryParams.currency),
        merchantReference: String(queryParams.tran_id),
        providerReference: String(queryParams.bank_tran_id),
        rawPayload: queryParams,
      };
    }

    return { ok: false, message: "Invalid or unrecognized callback status", rawPayload: queryParams };
  }
}
