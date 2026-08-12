import { requireCatalogManager } from "@/lib/auth/session";
import CouponForm from "../CouponForm";

export const metadata = { title: "Create Coupon - Admin" };

export default async function NewCouponPage() {
  await requireCatalogManager();

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Create Coupon</h1>
      <CouponForm />
    </div>
  );
}
