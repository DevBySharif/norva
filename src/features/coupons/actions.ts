"use server";

import { Prisma } from "@prisma/client";
import { validateCoupon, calculateDiscount } from "./service";
import { getStoreSettings } from "@/features/store/settings";
import { prisma } from "@/lib/db/prisma";
import { requireCatalogManager } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

export async function previewCheckoutTotals(
  subtotalStr: string,
  couponCode?: string
) {
  const subtotal = new Prisma.Decimal(subtotalStr);
  const storeSettings = await getStoreSettings();
  
  let shippingTotal = new Prisma.Decimal(0);
  let discountTotal = new Prisma.Decimal(0);
  
  const standardMethod = await prisma.shippingMethod.findFirst({ where: { isActive: true }, orderBy: { price: 'asc' } });
  
  if (storeSettings.freeShippingThreshold && subtotal.gte(storeSettings.freeShippingThreshold)) {
    shippingTotal = new Prisma.Decimal(0);
  } else if (standardMethod) {
    shippingTotal = standardMethod.price;
  }

  let validCoupon: { code: string } | null = null;
  let couponError: string | null = null;
  
  if (couponCode) {
    const result = await validateCoupon(couponCode, subtotal);
    if (result.ok) {
      discountTotal = calculateDiscount(subtotal, result);
      validCoupon = result;
    } else {
      couponError = result.message;
    }
  }

  const grandTotal = subtotal.sub(discountTotal).add(shippingTotal);

  return {
    subtotal: subtotal.toFixed(2),
    shippingTotal: shippingTotal.toFixed(2),
    discountTotal: discountTotal.toFixed(2),
    grandTotal: grandTotal.toFixed(2),
    couponError,
    validCoupon: validCoupon ? { code: validCoupon.code } : null
  };
}

export async function toggleCouponAction(id: string, isActive: boolean) {
  await requireCatalogManager();
  await prisma.coupon.update({ where: { id }, data: { isActive } });
  revalidatePath("/admin/coupons");
}

export async function saveCouponAction(data: {
  id?: string;
  code: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: string;
  minimumSubtotal: string;
  usageLimit: string;
  startsAt: string;
  expiresAt: string;
}) {
  await requireCatalogManager();
  
  const normalizedCode = data.code.trim().toUpperCase();
  if (!normalizedCode) throw new Error("Code is required");

  const existing = await prisma.coupon.findUnique({ where: { code: normalizedCode } });
  if (existing && existing.id !== data.id) {
    throw new Error("Coupon code already exists");
  }

  const payload = {
    code: normalizedCode,
    type: data.type,
    value: new Prisma.Decimal(data.value),
    minimumSubtotal: data.minimumSubtotal ? new Prisma.Decimal(data.minimumSubtotal) : null,
    usageLimit: data.usageLimit ? parseInt(data.usageLimit, 10) : null,
    startsAt: data.startsAt ? new Date(data.startsAt) : null,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
  };

  if (data.id) {
    await prisma.coupon.update({ where: { id: data.id }, data: payload });
  } else {
    await prisma.coupon.create({ data: payload });
  }

  revalidatePath("/admin/coupons");
  return { ok: true };
}
