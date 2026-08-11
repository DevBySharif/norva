import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getOrderByNumberForPublic } from "@/features/orders/service";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = { title: "Order status" };

export const dynamic = "force-dynamic";

const statusLabels: Record<string, string> = {
  PENDING: "Order placed",
  CONFIRMED: "Confirmed",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export default async function GuestOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { orderNumber } = await params;
  const sp = await searchParams;
  const access = Array.isArray(sp.access) ? sp.access[0] : sp.access ?? "";

  const order = await getOrderByNumberForPublic(orderNumber);
  if (!order || !order.lookupToken || access.length === 0 || access !== order.lookupToken) notFound();

  const address = order.shippingAddress as Record<string, string | null> | null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <Link href="/orders/lookup" className="text-sm text-[#D57959] hover:underline">← Look up another order</Link>
        <p className="mt-3 text-xs font-bold uppercase tracking-[.18em] text-[#8b5946]">Order status</p>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold">{order.orderNumber}</h1>
          <span data-testid="guest-status" className="inline-flex items-center rounded-full bg-[#8b5946] px-2.5 py-0.5 text-xs font-medium text-white">
            {statusLabels[order.status] ?? order.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-600">Placed {order.createdAt.toLocaleString()}{order.email ? <> · sent to <span className="font-medium text-gray-800">{order.email}</span></> : null}</p>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Payment</h2>
          <p className="mt-2 font-medium">{order.payment?.provider ?? "Cash on Delivery"}</p>
          <p className="text-sm text-gray-600">Status: {order.payment?.status ?? "PENDING"}</p>
        </section>
        <section className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Ship to</h2>
          <p className="mt-2 text-sm font-medium text-gray-800">{address?.line1}</p>
          {address?.line2 ? <p className="text-sm text-gray-800">{address.line2}</p> : null}
          <p className="text-sm text-gray-800">
            {address?.city}, {address?.state} {address?.postalCode}
          </p>
          <p className="text-sm text-gray-800">{address?.country}</p>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-6">
        <h2 className="text-lg font-semibold mb-4">Order summary</h2>
        <ul className="divide-y divide-[#e0d9cc]">
          {order.items.map((item) => (
            <li key={item.sku + (item.variantName ?? "")} className="py-4 flex justify-between gap-4">
              <div data-testid="guest-item">
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
          <div className="flex justify-between pt-2 border-t border-[#e0d9cc] text-base"><span className="font-semibold">Total</span><span className="font-bold">{formatCurrency(Number(order.grandTotal))}</span></div>
        </div>
      </section>

      <section data-testid="guest-timeline" className="mt-6 rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-6">
        <h2 className="text-lg font-semibold mb-4">Progress</h2>
        <ol className="space-y-3">
          {order.statusHistory.map((entry, index) => (
            <li key={`${entry.createdAt.toISOString()}-${index}`} className="flex items-start gap-3">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-[#D57959]" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-gray-900">{statusLabels[entry.status] ?? entry.status}</p>
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