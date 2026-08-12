import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getOrderByNumberForPublic } from "@/features/orders/service";
import { formatCurrency } from "@/lib/utils";

export const metadata: Metadata = { title: "Order confirmation" };

export const dynamic = "force-dynamic";

export default async function OrderSuccessPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const order = await getOrderByNumberForPublic(orderNumber);
  if (!order) notFound();

  const address = order.shippingAddress as Record<string, string | null> | null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="text-center mb-10">
        <div className="mx-auto mb-4 grid size-14 place-items-center rounded-full bg-[#D57959] text-white text-2xl" aria-hidden="true">✓</div>
        <h1 className="text-3xl font-semibold">Order confirmed</h1>
        <p className="mt-2 text-gray-600">Thanks! Your order has been placed.</p>
        <p className="mt-1 text-sm text-gray-500">
          Order reference <span className="font-medium text-gray-800" data-testid="order-reference">{order.orderNumber}</span>
        </p>
        {order.lookupToken ? (
          <p className="mt-4">
            <Link
              href={`/orders/${order.orderNumber}?access=${order.lookupToken}`}
              data-testid="view-order-link"
              className="text-sm font-medium text-[#D57959] hover:underline"
            >
              View order status & details →
            </Link>
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 mb-8">
        <div className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Payment</h2>
          <p className="mt-2 font-medium">{order.payments?.[0]?.provider ?? "Cash on Delivery"}</p>
          <p className="text-sm text-gray-600">Status: {order.payments?.[0]?.status ?? "PENDING"}</p>
        </div>
        <div className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Ship to</h2>
          <p className="mt-2 text-sm text-gray-800 font-medium">{address?.line1}</p>
          {address?.line2 ? <p className="text-sm text-gray-800">{address.line2}</p> : null}
          <p className="text-sm text-gray-800">{address?.city}, {address?.state} {address?.postalCode}</p>
          <p className="text-sm text-gray-800">{address?.country}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-6">
        <h2 className="text-lg font-semibold mb-4">Order summary</h2>
        <ul className="divide-y divide-[#e0d9cc]">
          {order.items.map((item) => (
            <li key={item.sku + item.variantName} className="py-4 flex justify-between gap-4">
              <div>
                <p className="font-medium text-gray-900">{item.productName}</p>
                <p className="text-sm text-gray-500">{item.variantName ?? "Default"} · SKU {item.sku}</p>
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
          <div className="flex justify-between pt-2 border-t border-[#e0d9cc] text-base"><span className="font-semibold">Total</span><span className="font-bold" data-testid="order-total">{formatCurrency(Number(order.grandTotal))}</span></div>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link href="/products" className="inline-block bg-[#D57959] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#c26d50] transition-colors">
          Continue Shopping
        </Link>
      </div>
    </main>
  );
}