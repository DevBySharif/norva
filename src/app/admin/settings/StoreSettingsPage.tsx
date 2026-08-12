"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateStoreSettingsAction } from "@/features/store/actions";

export default function StoreSettingsPage({
  settings,
  shippingFee,
}: {
  settings: { storeName?: string; currency?: string; freeShippingThreshold?: string | number | null; supportEmail?: string | null };
  shippingFee: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [storeName, setStoreName] = useState(settings.storeName || "");
  const [currency, setCurrency] = useState(settings.currency || "USD");
  const [freeShippingThreshold, setFreeShippingThreshold] = useState(
    settings.freeShippingThreshold ? Number(settings.freeShippingThreshold).toFixed(2) : ""
  );
  const [fee, setFee] = useState(shippingFee);
  const [supportEmail, setSupportEmail] = useState(settings.supportEmail || "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await updateStoreSettingsAction({
        storeName,
        currency,
        freeShippingThreshold,
        supportEmail,
        shippingFee: fee,
      });
      alert("Store settings updated successfully.");
      router.refresh();
    } catch {
      alert("Failed to update store settings.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Store Settings</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700">Store Name</label>
          <input
            type="text"
            required
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#D57959] focus:ring-[#D57959] sm:text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Currency (ISO Code)</label>
          <input
            type="text"
            required
            maxLength={3}
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#D57959] focus:ring-[#D57959] sm:text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Standard Shipping Fee</label>
          <div className="mt-1 relative rounded-md shadow-sm">
            <input
              type="number"
              step="0.01"
              min="0"
              required
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className="block w-full rounded-md border-gray-300 pl-3 focus:border-[#D57959] focus:ring-[#D57959] sm:text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Free Shipping Threshold</label>
          <p className="text-xs text-gray-500 mb-1">Leave empty to disable free shipping.</p>
          <div className="relative rounded-md shadow-sm">
            <input
              type="number"
              step="0.01"
              min="0"
              value={freeShippingThreshold}
              onChange={(e) => setFreeShippingThreshold(e.target.value)}
              className="block w-full rounded-md border-gray-300 pl-3 focus:border-[#D57959] focus:ring-[#D57959] sm:text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Support Email</label>
          <input
            type="email"
            value={supportEmail}
            onChange={(e) => setSupportEmail(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-[#D57959] focus:ring-[#D57959] sm:text-sm"
          />
        </div>

        <div className="pt-4 flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex justify-center rounded-md border border-transparent bg-[#D57959] py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-[#c46949] focus:outline-none focus:ring-2 focus:ring-[#D57959] focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
