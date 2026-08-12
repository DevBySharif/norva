"use client";

import { toggleCouponAction } from "@/features/coupons/actions";
import Link from "next/link";
import { useState } from "react";

export default function CouponList({ coupons }: { coupons: { id: string; code: string; type: string; value: string | number | { toString: () => string }; usageCount: number; usageLimit: number | null; isActive: boolean }[] }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function toggleStatus(id: string, currentStatus: boolean) {
    setLoadingId(id);
    try {
      await toggleCouponAction(id, !currentStatus);
    } catch {
      alert("Failed to update status");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="bg-white shadow-sm rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type & Value</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usage</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {coupons.map((coupon) => (
            <tr key={coupon.id}>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                {coupon.code}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {coupon.type === "PERCENTAGE" ? `${coupon.value}%` : `$${coupon.value}`}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                {coupon.usageCount} / {coupon.usageLimit ?? "∞"}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                <button
                  onClick={() => toggleStatus(coupon.id, coupon.isActive)}
                  disabled={loadingId === coupon.id}
                  className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    coupon.isActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                  }`}
                >
                  {loadingId === coupon.id ? "Updating..." : coupon.isActive ? "Active" : "Inactive"}
                </button>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                <Link href={`/admin/coupons/${coupon.id}`} className="text-[#D57959] hover:text-[#c46949]">
                  Edit
                </Link>
              </td>
            </tr>
          ))}
          {coupons.length === 0 && (
            <tr>
              <td colSpan={5} className="px-6 py-4 text-center text-sm text-gray-500">
                No coupons found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
