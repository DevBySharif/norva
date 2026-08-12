import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/lib/auth/session";
import { getCustomerOrder } from "@/features/customers/queries";
import { orderStatusLabel } from "@/features/orders/constants";
import { formatCurrency } from "@/lib/utils";
import { AccountNav } from "@/components/account/account-nav";

export const metadata: Metadata = { title: "Order details" };

export const dynamic = "force-dynamic";

export default async function AccountOrderDetailPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const user = await requireCustomer();
  const { orderNumber } = await params;
  const order = await getCustomerOrder(user.id, orderNumber);
  if (!order) notFound();

  const address = order.shippingAddress as Record<string, string | null> | null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <Link href="/account/orders" className="text-sm font-semibold text-[#D57959] hover:underline">← Back to my orders</Link>
        <h1 className="mt-3 text-3xl font-semibold">{order.orderNumber}</h1>
        <p className="mt-1 text-sm text-gray-600">
          Placed {order.createdAt.toLocaleString()} ·{" "}
          <span data-testid="customer-order-status" className="rounded-full bg-[#8b5946] px-2.5 py-0.5 text-xs font-medium text-white">{orderStatusLabel(order.status)}</span>
        </p>
      </div>

      <div className="mb-6">
        <AccountNav />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <section aria-labelledby="payment-heading" className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-5">
          <h2 id="payment-heading" className="text-sm font-semibold uppercase tracking-wide text-gray-500">Payment</h2>
          <p className="mt-2 font-medium">{order.payments?.[0]?.provider ?? "Cash on Delivery"}</p>
          <p className="text-sm text-gray-600">Status: {order.payments?.[0]?.status ?? "PENDING"}</p>
        </section>
        <section aria-labelledby="ship-heading" className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-5">
          <h2 id="ship-heading" className="text-sm font-semibold uppercase tracking-wide text-gray-500">Ship to</h2>
          <p className="mt-2 text-sm font-medium text-gray-800">{address?.line1}</p>
          {address?.line2 ? <p className="text-sm text-gray-800">{address.line2}</p> : null}
          <p className="text-sm text-gray-800">
            {[address?.city, address?.state, address?.postalCode].filter(Boolean).join(", ")}
          </p>
          <p className="text-sm text-gray-800">{address?.country}</p>
        </section>
      </div>

      <section aria-labelledby="summary-heading" className="mt-6 rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-6">
        <h2 id="summary-heading" className="text-lg font-semibold mb-4">Order summary</h2>
        <ul className="divide-y divide-[#e0d9cc]" data-testid="customer-order-items">
          {order.items.map((item) => (
            <li key={item.sku + (item.variantName ?? "")} className="py-4 flex justify-between gap-4">
              <div>
                <p className="font-medium text-gray-900">{item.productName}</p>
                <p className="text-sm text-gray-500">
                  {item.variantName ?? "Default"} · SKU {item.sku}
                </p>
                <p className="text-sm text-gray-500">Qty {item.quantity}</p>
              </div>
              <p className="font-medium shrink-0">{formatCurrency(Number(item.lineTotal))}</p>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-2 border-t border-[#e0d9cc] pt-4 text-sm">
          <div className="flex justify-between"><span className="text-gray-600">Subtotal</span><span className="font-medium">{formatCurrency(Number(order.subtotal))}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Shipping</span><span className="font-medium">{Number(order.shippingTotal) === 0 ? "Free" : formatCurrency(Number(order.shippingTotal))}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Tax</span><span className="font-medium">{formatCurrency(Number(order.taxTotal))}</span></div>
          <div className="flex justify-between pt-2 border-t border-[#e0d9cc] text-base"><span className="font-semibold">Total</span><span className="font-bold" data-testid="customer-order-total">{formatCurrency(Number(order.grandTotal))}</span></div>
        </div>
      </section>

      <section aria-labelledby="progress-heading" className="mt-6 rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-6">
        <h2 id="progress-heading" className="text-lg font-semibold mb-4">Progress</h2>
        <ol className="space-y-3">
          {order.statusHistory.map((entry, index) => (
            <li key={`${entry.createdAt.toISOString()}-${index}`} className="flex items-start gap-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#D57959]" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-gray-900">{orderStatusLabel(entry.status)}</p>
                <p className="text-xs text-gray-500">{entry.createdAt.toLocaleString()}</p>
                {entry.note ? <p className="mt-0.5 text-sm text-gray-600">{entry.note}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
