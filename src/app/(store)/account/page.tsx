import type { Metadata } from "next";
import Link from "next/link";
import { requireCustomer } from "@/lib/auth/session";
import { getAccountOverview, getCustomerProfile } from "@/features/customers/queries";
import { orderStatusLabel } from "@/features/orders/constants";
import { formatCurrency } from "@/lib/utils";
import { AccountNav } from "@/components/account/account-nav";
import { SignOutButton } from "@/components/account/sign-out-button";

export const metadata: Metadata = { title: "My account" };

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireCustomer();
  const [profile, overview] = await Promise.all([getCustomerProfile(user.id), getAccountOverview(user.id)]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#8b5946]">My account</p>
          <h1 className="mt-1 text-3xl font-semibold">Welcome back, {profile?.name ?? "there"}</h1>
          <p className="mt-1 text-sm text-gray-600">{profile?.email}</p>
        </div>
        <SignOutButton />
      </div>

      <div className="mt-8">
        <AccountNav />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <section aria-labelledby="recent-heading" className="md:col-span-2 rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-6">
          <div className="flex items-center justify-between">
            <h2 id="recent-heading" className="text-lg font-semibold">Recent orders</h2>
            <Link href="/account/orders" className="text-sm font-semibold text-[#D57959] hover:underline">View all</Link>
          </div>
          {overview.recentOrders.length === 0 ? (
            <p className="mt-4 text-sm text-gray-600">No orders yet. When you place an order it will appear here.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[#e0d9cc]" data-testid="recent-orders">
              {overview.recentOrders.map((order) => (
                <li key={order.id}>
                  <Link href={`/account/orders/${order.orderNumber}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="font-medium text-gray-900">{order.orderNumber}</span>
                    <span className="text-sm text-gray-600">{order.createdAt.toLocaleDateString()}</span>
                    <span className="rounded-full bg-[#8b5946] px-2.5 py-0.5 text-xs font-medium text-white">{orderStatusLabel(order.status)}</span>
                    <span className="text-sm font-semibold">{formatCurrency(Number(order.grandTotal))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="address-heading" className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-6">
          <div className="flex items-center justify-between">
            <h2 id="address-heading" className="text-lg font-semibold">Addresses</h2>
            <Link href="/account/addresses" className="text-sm font-semibold text-[#D57959] hover:underline">Manage</Link>
          </div>
          {overview.defaultAddress ? (
            <p className="mt-4 text-sm text-gray-700" data-testid="default-address-line">
              {overview.defaultAddress.label ?? "Default"}: {overview.defaultAddress.line1}, {overview.defaultAddress.city}
            </p>
          ) : (
            <p className="mt-4 text-sm text-gray-600">
              {overview.addressCount === 0 ? "No saved addresses." : "No default address set."}
            </p>
          )}
          <p className="mt-2 text-xs text-gray-500">{overview.addressCount} saved {overview.addressCount === 1 ? "address" : "addresses"}.</p>
        </section>
      </div>
    </main>
  );
}
