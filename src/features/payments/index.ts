import { TestPaymentProvider } from "./adapters/test-adapter";
import { SSLCommerzPaymentProvider } from "./adapters/sslcommerz-adapter";
import type { PaymentProviderAdapter } from "./types";

export function getPaymentProvider(): PaymentProviderAdapter {
  const provider = process.env.PAYMENT_PROVIDER || "TEST";
  
  if (provider === "SSLCOMMERZ") {
    return new SSLCommerzPaymentProvider();
  }
  
  // Default to TEST for unrecognised or "TEST"
  return new TestPaymentProvider();
}
