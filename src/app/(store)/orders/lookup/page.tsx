import type { Metadata } from "next";
import { OrderLookupForm } from "@/components/store/order-lookup-form";

export const metadata: Metadata = { title: "Track your order" };

export const dynamic = "force-dynamic";

export default function OrderLookupPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-10 sm:px-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-semibold">Track your order</h1>
        <p className="mt-2 text-sm text-gray-600">Look up an order placed with NORVA by its number and the email used at checkout.</p>
      </div>
      <OrderLookupForm />
    </main>
  );
}