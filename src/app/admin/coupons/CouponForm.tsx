"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveCouponAction } from "@/features/coupons/actions";

export default function CouponForm({ initialData }: { initialData?: { id?: string; code?: string; type?: string; value?: string | number; minimumSubtotal?: string | number | null; usageLimit?: string | number | null; startsAt?: string | null; expiresAt?: string | null } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState(initialData?.code || "");
  const [type, setType] = useState<"PERCENTAGE" | "FIXED_AMOUNT">((initialData?.type as "PERCENTAGE" | "FIXED_AMOUNT") || "PERCENTAGE");
  const [value, setValue] = useState(initialData?.value?.toString() || "");
  const [minimumSubtotal, setMinimumSubtotal] = useState(initialData?.minimumSubtotal?.toString() || "");
  const [usageLimit, setUsageLimit] = useState(initialData?.usageLimit?.toString() || "");
  
  const formatDateForInput = (isoDate?: string) => {
    if (!isoDate) return "";
    return new Date(isoDate).toISOString().slice(0, 16);
  };
  const [startsAt, setStartsAt] = useState(formatDateForInput(initialData?.startsAt ?? undefined));
  const [expiresAt, setExpiresAt] = useState(formatDateForInput(initialData?.expiresAt ?? undefined));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await saveCouponAction({
        id: initialData?.id,
        code,
        type,
        value,
        minimumSubtotal,
        usageLimit,
        startsAt: startsAt ? new Date(startsAt).toISOString() : "",
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : "",
      });
      router.push("/admin/coupons");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message || "Failed to save coupon.");
      } else {
        setError("Failed to save coupon.");
      }
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-sm max-w-2xl">
      {error && <div className="bg-red-50 text-red-700 p-4 rounded-md text-sm">{error}</div>}

      <div>
        <label className="block text-sm font-medium text-gray-700">Coupon Code</label>
        <input
          type="text"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#D57959] focus:ring-[#D57959] sm:text-sm"
          placeholder="e.g. SAVE20"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "PERCENTAGE" | "FIXED_AMOUNT")}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#D57959] focus:ring-[#D57959] sm:text-sm"
          >
            <option value="PERCENTAGE">Percentage (%)</option>
            <option value="FIXED_AMOUNT">Fixed Amount ($)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Value</label>
          <input
            type="number"
            step="0.01"
            min="0"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#D57959] focus:ring-[#D57959] sm:text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Minimum Subtotal (Optional)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={minimumSubtotal}
            onChange={(e) => setMinimumSubtotal(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#D57959] focus:ring-[#D57959] sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Usage Limit (Optional)</label>
          <input
            type="number"
            min="1"
            step="1"
            value={usageLimit}
            onChange={(e) => setUsageLimit(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#D57959] focus:ring-[#D57959] sm:text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Starts At (Optional)</label>
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#D57959] focus:ring-[#D57959] sm:text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Expires At (Optional)</label>
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#D57959] focus:ring-[#D57959] sm:text-sm"
          />
        </div>
      </div>

      <div className="pt-4 flex justify-end space-x-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#D57959] focus:ring-offset-2"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex justify-center rounded-md border border-transparent bg-[#D57959] py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-[#c46949] focus:outline-none focus:ring-2 focus:ring-[#D57959] focus:ring-offset-2 disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Coupon"}
        </button>
      </div>
    </form>
  );
}
