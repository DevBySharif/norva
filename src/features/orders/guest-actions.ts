"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";

const lookupSchema = z.object({
  orderNumber: z.string().trim().min(1, "Enter your order number.").max(60),
  email: z.string().trim().toLowerCase().email("Enter the email you used at checkout."),
});

export type GuestLookupResult = { ok: true; url: string } | { ok: false; message: string };

/**
 * Resolves an order to its public detail page using the one-time access token
 * attached at placement. A missing order and a mismatched email return the
 * same message so the existence of an order is never leaked. On success the
 * token-protected URL is returned for the client to navigate to.
 */
export async function lookupGuestOrder(input: unknown): Promise<GuestLookupResult> {
  const parsed = lookupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "Enter a valid order number and the email used at checkout." };
  }

  const order = await prisma.order.findFirst({
    where: { orderNumber: parsed.data.orderNumber },
    select: { orderNumber: true, email: true, lookupToken: true },
  });

  const matches =
    order && order.email.toLowerCase() === parsed.data.email && (order.lookupToken?.length ?? 0) > 0;

  if (!matches) {
    return { ok: false, message: "We couldn't find an order matching those details." };
  }

  return { ok: true, url: `/orders/${order!.orderNumber}?access=${order!.lookupToken}` };
}