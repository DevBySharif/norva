"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { claimGuestOrder } from "@/features/customers/actions";

export function ClaimOrderForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  const inputClass = "mt-1.5 block min-h-11 w-full rounded-md border border-[#d8d0c3] bg-[#fffdf7]/80 px-3 py-2 text-sm shadow-sm focus:border-primary";

  return (
    <section aria-labelledby="claim-heading" className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-6">
      <h2 id="claim-heading" className="text-lg font-semibold">Link a guest order</h2>
      <p className="mt-1 text-sm text-gray-600">
        Placed an order without an account? Link it here using the order number, email, and access link from your confirmation so it appears in your order history.
      </p>

      <form
        action={async (formData) => {
          setPending(true);
          setError("");
          setSuccess(false);
          const result = await claimGuestOrder({
            orderNumber: formData.get("orderNumber"),
            email: formData.get("email"),
            accessToken: formData.get("accessToken"),
          });
          setPending(false);
          if (result.ok) {
            setSuccess(true);
            router.refresh();
          } else {
            setError(result.message);
          }
        }}
        className="mt-5 grid gap-4 sm:grid-cols-2"
        noValidate
      >
        <div>
          <label className="block text-sm font-semibold" htmlFor="claim-orderNumber">Order number</label>
          <input id="claim-orderNumber" name="orderNumber" className={inputClass} autoComplete="off" required />
        </div>
        <div>
          <label className="block text-sm font-semibold" htmlFor="claim-email">Email used at checkout</label>
          <input id="claim-email" name="email" type="email" className={inputClass} autoComplete="off" required />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-semibold" htmlFor="claim-token">Access token from your confirmation link</label>
          <input id="claim-token" name="accessToken" className={inputClass} autoComplete="off" required />
        </div>

        {error && <p role="alert" data-testid="claim-error" className="text-sm text-red-700 sm:col-span-2">{error}</p>}
        {success && <p role="status" data-testid="claim-success" className="text-sm text-green-700 sm:col-span-2">Order linked to your account.</p>}

        <div className="sm:col-span-2">
          <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#D57959] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#c26d50] disabled:opacity-60">
            {pending ? "Linking…" : "Link order to my account"}
          </button>
        </div>
      </form>
    </section>
  );
}
