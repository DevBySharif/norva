"use server";

import { checkoutSchema } from "@/lib/validations/checkout";
import { getCurrentUser } from "@/lib/auth/session";
import { getPublicShippingMethods, placeOrderCore, type OrderPlacementResult, type PublicShippingMethod } from "@/features/orders/service";

export type PlaceOrderResponse = OrderPlacementResult | { ok: false; code: "validation"; message: string; fieldErrors: Record<string, string> };

export type CheckoutFieldErrorKey =
  | "customer.fullName"
  | "customer.email"
  | "customer.phone"
  | "shippingAddress.line1"
  | "shippingAddress.line2"
  | "shippingAddress.city"
  | "shippingAddress.state"
  | "shippingAddress.postalCode"
  | "shippingAddress.country";

import { after } from "next/server";
import { processPendingNotifications } from "@/features/notifications/outbox";

export async function placeOrder(input: unknown): Promise<PlaceOrderResponse> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    if (parsed.error.issues.some((issue) => issue.path[0] === "items" || issue.path[0] === "idempotencyKey")) {
      return { ok: false, code: "validation", message: "Your cart has changed. Please review it and try again.", fieldErrors: {} };
    }
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") as CheckoutFieldErrorKey;
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, code: "validation", message: "Please correct the highlighted fields.", fieldErrors };
  }

  // Ownership is always derived from the server session — never from the client payload.
  const session = await getCurrentUser();
  const userId = session?.user && session.user.role === "CUSTOMER" ? session.user.id : undefined;

  const result = await placeOrderCore(parsed.data, { userId, saveAddress: parsed.data.saveAddress === true });
  after(() => { processPendingNotifications().catch(console.error); });
  return result;
}

export async function getShippingMethodsPublic(): Promise<PublicShippingMethod[]> {
  return getPublicShippingMethods();
}