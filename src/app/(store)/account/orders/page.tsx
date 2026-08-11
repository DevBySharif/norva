import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/lib/auth/session";
import { getCustomerOrders } from "@/features/customers/queries";
import { orderStatusLabel } from "@/features/orders/constants";
import { formatCurrency } from "@/lib/utils";
import { AccountNav } from "@/components/account/account-nav";
import { ClaimOrderForm } from "@/components/account/claim-order-form";

export const metadata: Metadata = { title: "My orders" };

export const dynamic = "force-dynamic";

export default async function AccountOrdersPage() {
  const user = await requireCustomer();
  const orders = await getCustomerOrders(user.id);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold">My orders</h1>
      <p className="mt-1 text-sm text-gray-600">A history of every order linked to your account.</p>

      <div className="mt-8">
        <AccountNav />
      </div>

      <section aria-labelledby="orders-heading" className="mt-8 rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-6">
        <h2 id="orders-heading" className="text-lg font-semibold">Order history</h2>
        {orders.length === 0 ? (
          <p className="mt-4 text-sm text-gray-600" data-testid="orders-empty">You have no orders yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-[#e0d9cc]" data-testid="orders-list">
            {orders.map((order) => (
              <li key={order.id}>
                <Link href={`/account/orders/${order.orderNumber}`} className="flex flex-wrap items-center justify-between gap-2 py-4">
                  <span>
                    <span className="block font-medium text-gray-900">{order.orderNumber}</span>
                    <span className="block text-sm text-gray-600">Placed {order.createdAt.toLocaleDateString()}</span>
                  </span>
                  <span className="rounded-full bg-[#8b5946] px-2.5 py-0.5 text-xs font-medium text-white">{orderStatusLabel(order.status)}</span>
                  <span className="text-sm font-semibold">{formatCurrency(Number(order.grandTotal))}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6">
        <ClaimOrderForm />
      </div>
    </main>
  );
}
