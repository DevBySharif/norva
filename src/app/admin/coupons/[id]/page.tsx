import { requireCatalogManager } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import CouponForm from "../CouponForm";
import { notFound } from "next/navigation";

export const metadata = { title: "Edit Coupon - Admin" };

export default async function EditCouponPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCatalogManager();
  const { id } = await params;

  const coupon = await prisma.coupon.findUnique({
    where: { id },
  });

  if (!coupon) notFound();

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Edit Coupon</h1>
      <CouponForm initialData={{
        ...coupon,
        value: coupon.value.toFixed(2),
        minimumSubtotal: coupon.minimumSubtotal?.toFixed(2),
        startsAt: coupon.startsAt?.toISOString(),
        expiresAt: coupon.expiresAt?.toISOString(),
      }} />
    </div>
  );
}
