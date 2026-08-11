"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { OrderStatus } from "@prisma/client";
import { requireOrderManager } from "@/lib/auth/session";
import { markPaymentReceivedCore, transitionOrderStatusCore, type OrderMutationResult } from "./order-lifecycle";

export type OrderActionResult = OrderMutationResult | { ok: false; code: "validation"; message: string };

const ORDER_STATUSES = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"] as const;

const updateOrderStatusSchema = z.object({
  orderId: z.string().trim().min(1).max(120),
  toStatus: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(500).optional(),
  internalNote: z.string().trim().max(1000).optional(),
});

export async function updateOrderStatus(input: unknown): Promise<OrderActionResult> {
  const parsed = updateOrderStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation", message: "Invalid status update request." };

  const user = await requireOrderManager();
  const { orderId, toStatus, note, internalNote } = parsed.data;

  const result = await transitionOrderStatusCore(orderId, toStatus as OrderStatus, {
    actor: { type: "ADMIN", userId: user.id },
    note: note ?? null,
    internalNote: internalNote ?? null,
  });

  revalidatePath("/admin/orders", "page");
  revalidatePath(`/admin/orders/${orderId}`, "page");
  return result;
}

const markPaymentSchema = z.object({ orderId: z.string().trim().min(1).max(120) });

export async function markPaymentReceived(input: unknown): Promise<OrderActionResult> {
  const parsed = markPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "validation", message: "Invalid payment update request." };

  const user = await requireOrderManager();
  const result = await markPaymentReceivedCore(parsed.data.orderId, { type: "ADMIN", userId: user.id });

  revalidatePath("/admin/orders", "page");
  revalidatePath(`/admin/orders/${parsed.data.orderId}`, "page");
  return result;
}