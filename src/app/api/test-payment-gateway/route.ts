import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  
  // Simulation params
  const orderNumber = url.searchParams.get("orderNumber");
  const amount = url.searchParams.get("amount");
  const currency = url.searchParams.get("currency");
  const providerReference = url.searchParams.get("providerReference");
  const successUrl = url.searchParams.get("successUrl");
  const failUrl = url.searchParams.get("failUrl");
  const cancelUrl = url.searchParams.get("cancelUrl");
  const ipnUrl = url.searchParams.get("ipnUrl");

  const action = url.searchParams.get("action");

  if (action) {
    // 1. Fire Webhook (IPN) if provided
    if (ipnUrl) {
      try {
        await fetch(ipnUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: action === "SUCCESS" ? "SUCCESS" : action === "CANCEL" ? "CANCELLED" : "FAILED",
            amount,
            currency,
            merchantReference: orderNumber,
            providerReference,
            signature: "VALID_TEST_SIGNATURE",
          }),
        });
      } catch (err) {
        console.error("Test gateway failed to send IPN:", err);
      }
    }

    // 2. Redirect back
    let redirectTarget = successUrl;
    if (action === "CANCEL") redirectTarget = cancelUrl;
    if (action === "FAIL") redirectTarget = failUrl;

    if (redirectTarget) {
      const redirectUrl = new URL(redirectTarget);
      redirectUrl.searchParams.set("status", action === "SUCCESS" ? "VALID" : action === "CANCEL" ? "CANCELLED" : "FAILED");
      redirectUrl.searchParams.set("amount", amount || "0");
      redirectUrl.searchParams.set("currency", currency || "USD");
      redirectUrl.searchParams.set("tran_id", orderNumber || "");
      redirectUrl.searchParams.set("bank_tran_id", providerReference || "");
      redirectUrl.searchParams.set("signature", "VALID_TEST_SIGNATURE");
      redirectUrl.searchParams.set("val_id", `TEST_VALIDATION_${Date.now()}`); // For sslcommerz emulation if needed
      
      return NextResponse.redirect(redirectUrl.toString());
    }
  }

  // Render a simple HTML page for the sandbox checkout
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Test Payment Gateway</title>
      <style>
        body { font-family: system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; background: #f9fafb; margin: 0; }
        .card { background: white; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); width: 100%; max-width: 400px; }
        h1 { margin-top: 0; font-size: 1.5rem; text-align: center; }
        .details { background: #f3f4f6; padding: 1rem; border-radius: 8px; margin-bottom: 2rem; font-size: 0.875rem; }
        .btn { display: block; width: 100%; padding: 0.75rem; border: none; border-radius: 6px; font-weight: 600; font-size: 1rem; cursor: pointer; margin-bottom: 0.75rem; color: white; text-align: center; text-decoration: none; }
        .btn-success { background: #10b981; }
        .btn-fail { background: #ef4444; }
        .btn-cancel { background: #6b7280; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>Test Payment Gateway</h1>
        <div class="details">
          <p><strong>Order:</strong> ${orderNumber}</p>
          <p><strong>Amount:</strong> ${amount} ${currency}</p>
          <p><strong>Ref:</strong> ${providerReference}</p>
        </div>
        <a href="${request.url}&action=SUCCESS" class="btn btn-success">Simulate Success</a>
        <a href="${request.url}&action=FAIL" class="btn btn-fail">Simulate Failure</a>
        <a href="${request.url}&action=CANCEL" class="btn btn-cancel">Simulate Cancel</a>
      </div>
    </body>
    </html>
  `;

  return new NextResponse(html, { headers: { "Content-Type": "text/html" } });
}
