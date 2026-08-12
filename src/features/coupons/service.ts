import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

export type CouponValidationResult = 
  | { ok: true; id: string; code: string; type: string; value: Prisma.Decimal }
  | { ok: false; code: "not_found" | "inactive" | "expired" | "not_started" | "usage_limit_reached" | "minimum_subtotal_not_met"; message: string };

export async function validateCoupon(code: string, subtotal: Prisma.Decimal): Promise<CouponValidationResult> {
  const normalizedCode = code.trim().toUpperCase();
  if (!normalizedCode) return { ok: false, code: "not_found", message: "Invalid coupon code." };

  const coupon = await prisma.coupon.findUnique({
    where: { code: normalizedCode }
  });

  if (!coupon) return { ok: false, code: "not_found", message: "Coupon code not found." };
  if (!coupon.isActive) return { ok: false, code: "inactive", message: "This coupon is no longer active." };

  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) {
    return { ok: false, code: "not_started", message: "This coupon is not yet valid." };
  }
  if (coupon.expiresAt && now > coupon.expiresAt) {
    return { ok: false, code: "expired", message: "This coupon has expired." };
  }

  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) {
    return { ok: false, code: "usage_limit_reached", message: "This coupon's usage limit has been reached." };
  }

  if (coupon.minimumSubtotal !== null && subtotal.lt(coupon.minimumSubtotal)) {
    return { ok: false, code: "minimum_subtotal_not_met", message: `This coupon requires a minimum order of $${coupon.minimumSubtotal.toFixed(2)}.` };
  }

  return {
    ok: true,
    id: coupon.id,
    code: coupon.code,
    type: coupon.type,
    value: coupon.value
  };
}

export function calculateDiscount(subtotal: Prisma.Decimal, couponResult: CouponValidationResult): Prisma.Decimal {
  if (!couponResult.ok) return new Prisma.Decimal(0);

  if (couponResult.type === "PERCENTAGE") {
    // Validate percentage range
    let percentage = couponResult.value;
    if (percentage.lt(0)) percentage = new Prisma.Decimal(0);
    if (percentage.gt(100)) percentage = new Prisma.Decimal(100);

    const discount = subtotal.mul(percentage).div(100);
    return discount;
  }

  if (couponResult.type === "FIXED_AMOUNT") {
    // Discount must not exceed subtotal
    if (couponResult.value.gt(subtotal)) return subtotal;
    return couponResult.value;
  }

  return new Prisma.Decimal(0);
}
