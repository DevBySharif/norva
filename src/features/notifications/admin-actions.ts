"use server";

import { revalidatePath } from "next/cache";
import { requireOrderManager } from "@/lib/auth/session";
import { retryNotification } from "./outbox";

/** Admin-only manual retry for a FAILED outbox row. */
export async function retryNotificationAction(id: string): Promise<{ ok: boolean }> {
  await requireOrderManager();
  await retryNotification(id);
  revalidatePath("/admin/notifications");
  revalidatePath("/admin/notifications?status=*");
  return { ok: true };
}
