import { requireCatalogManager } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import Link from "next/link";
import CouponList from "./CouponList";

export const metadata = { title: "Coupons - Admin" };

export default async function CouponsPage() {
  await requireCatalogManager();

  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      type: true,
      value: true,
      isActive: true,
      usageCount: true,
      usageLimit: true,
    }
  });

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Coupons</h1>
          <p className="mt-2 text-sm text-gray-700">
            Manage discount codes and usage limits.
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link
            href="/admin/coupons/new"
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-[#D57959] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#c46949] focus:outline-none focus:ring-2 focus:ring-[#D57959] focus:ring-offset-2 sm:w-auto"
          >
            Create Coupon
          </Link>
        </div>
      </div>

      <CouponList coupons={coupons.map(c => ({ ...c, value: c.value.toFixed(2) }))} />
    </div>
  );
}
