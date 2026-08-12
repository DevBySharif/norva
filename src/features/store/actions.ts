"use server";

import { requireCatalogManager } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";

export async function updateStoreSettingsAction(data: {
  storeName: string;
  currency: string;
  freeShippingThreshold: string;
  supportEmail: string;
  shippingFee: string;
}) {
  await requireCatalogManager();

  const threshold = data.freeShippingThreshold.trim() === "" ? null : new Prisma.Decimal(data.freeShippingThreshold);
  
  await prisma.storeSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      storeName: data.storeName,
      currency: data.currency,
      freeShippingThreshold: threshold,
      supportEmail: data.supportEmail,
    },
    update: {
      storeName: data.storeName,
      currency: data.currency,
      freeShippingThreshold: threshold,
      supportEmail: data.supportEmail,
    }
  });

  const fee = new Prisma.Decimal(data.shippingFee);
  const existingMethod = await prisma.shippingMethod.findFirst({ where: { isActive: true }, orderBy: { price: "asc" } });
  
  if (existingMethod) {
    await prisma.shippingMethod.update({
      where: { id: existingMethod.id },
      data: { price: fee }
    });
  } else {
    await prisma.shippingMethod.create({
      data: {
        name: "Standard Shipping",
        code: "standard_shipping",
        price: fee,
        isActive: true
      }
    });
  }

  await prisma.auditLog.create({
    data: {
      action: "STORE_SETTINGS_UPDATED",
      entityType: "StoreSettings",
      entityId: "default",
      metadata: { ...data }
    }
  });

  revalidatePath("/admin/settings");
  revalidatePath("/checkout");
  
  return { ok: true };
}
