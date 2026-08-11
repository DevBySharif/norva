"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { lookupGuestOrder, type GuestLookupResult } from "@/features/orders/guest-actions";

export function OrderLookupForm() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result: GuestLookupResult = await lookupGuestOrder({
        orderNumber: formData.get("orderNumber"),
        email: formData.get("email"),
      });
      if (result.ok) {
        router.push(result.url);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-6">
      <h2 className="text-lg font-semibold">Track your order</h2>
      <p className="mt-1 text-sm text-gray-600">Enter your order number and the email used at checkout to see live order status and delivery details.</p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <label className="block text-sm">
          <span className="font-medium">Order number</span>
          <input
            name="orderNumber"
            type="text"
            autoComplete="off"
            data-testid="lookup-order-number"
            placeholder="e.g. NORVA-20260812-001234-ab12cd34"
            className="mt-1 w-full rounded-lg border border-[#d8d0c3] bg-white px-3 py-2 outline-none focus:border-[#D57959]"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Email address</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            data-testid="lookup-email"
            placeholder="you@example.com"
            className="mt-1 w-full rounded-lg border border-[#d8d0c3] bg-white px-3 py-2 outline-none focus:border-[#D57959]"
          />
        </label>
        <button
          type="submit"
          disabled={isPending}
          data-testid="lookup-submit"
          className="w-full rounded-lg bg-[#D57959] px-6 py-3 text-sm font-medium text-white hover:bg-[#c26d50] transition-colors disabled:opacity-50"
        >
          {isPending ? "Looking up…" : "View order status"}
        </button>
      </form>
      {error && (
        <p role="status" data-testid="lookup-error" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}