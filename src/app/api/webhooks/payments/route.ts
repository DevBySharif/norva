import { NextResponse } from "next/server";
import { getPaymentProvider } from "@/features/payments";
import { reconcilePayment } from "@/features/payments/reconciliation";

export async function POST(request: Request) {
  try {
    const provider = getPaymentProvider();
    
    // SSLCOMMERZ uses form data for IPN
    const contentType = request.headers.get("content-type") || "";
    let body: unknown;
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      body = Object.fromEntries(formData.entries());
    } else {
      body = await request.json();
    }
    
    const headers = Object.fromEntries(request.headers.entries());

    const validation = await provider.verifyNotification(body, headers);

    if (!validation.ok) {
      console.warn("Payment webhook validation failed:", validation.message);
      return new NextResponse("Invalid notification", { status: 400 });
    }

    const orderNumber = validation.merchantReference;
    if (!orderNumber) {
      return new NextResponse("Missing merchant reference", { status: 400 });
    }

    const result = await reconcilePayment(orderNumber, validation);

    if (!result.ok) {
      console.warn(`Payment reconciliation failed for ${orderNumber}: ${result.message}`);
      // Returning 200 so the provider doesn't keep retrying if it's an unrecoverable business failure (like Amount Mismatch)
      // If it was a lock timeout (P2034) we would ideally return 503 so it retries, 
      // but reconcilePayment handles that gracefully. For now, 200 is safest to avoid spam unless it's a transient error.
      return new NextResponse("Reconciliation failed", { status: 200 });
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    console.error("Payment webhook processing error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
