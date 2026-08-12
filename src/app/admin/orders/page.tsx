import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import type { OrderStatus } from "@prisma/client";
import { getAdminOrders, getAdminOrderStatusCounts, type AdminOrderFilters } from "@/features/orders/admin-queries";

export const dynamic = "force-dynamic";

const STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"];

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";
  const activeStatus = (one(sp.status) as OrderStatus | "") || undefined;
  const filters: AdminOrderFilters = {
    status: activeStatus ?? undefined,
    paymentStatus: (one(sp.payment) as AdminOrderFilters["paymentStatus"]) || undefined,
    search: one(sp.q) || undefined,
    dateFrom: one(sp.from) || undefined,
    dateTo: one(sp.to) || undefined,
  };

  const [orders, counts] = await Promise.all([getAdminOrders(filters), getAdminOrderStatusCounts()]);
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return (
    <main className="admin-paper min-h-[calc(100vh-4rem)] px-4 py-7 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#8b5946]">Operations</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Orders</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Move orders through fulfillment — confirm, process, ship, deliver — and capture cash on delivery.</p>

        <div className="mt-7 flex flex-wrap items-center gap-2" aria-label="Orders by status">
          <Link
            href="/admin/orders"
            data-testid={`status-chip-ALL`}
            className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted"
          >
            All · {total}
          </Link>
          {STATUSES.map((status) => (
            <Link
              key={status}
              href={`/admin/orders?status=${status}`}
              data-testid={`status-chip-${status}`}
              aria-current={activeStatus === status ? "page" : undefined}
              className="rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted"
            >
              {status} · {counts[status]}
            </Link>
          ))}
        </div>

        <form method="get" action="/admin/orders" className="mt-4 grid gap-3 rounded-xl border border-dashed bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="block text-sm">
            <span className="font-medium">Search</span>
            <input name="q" type="search" defaultValue={filters.search} placeholder="Order number or email" className="mt-1 w-full rounded-md border bg-background px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Status</span>
            <select name="status" defaultValue={filters.status ?? "ALL"} className="mt-1 w-full rounded-md border bg-background px-3 py-2">
              <option value="ALL">All statuses</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Payment</span>
            <select name="payment" defaultValue={filters.paymentStatus ?? "ALL"} className="mt-1 w-full rounded-md border bg-background px-3 py-2">
              <option value="ALL">Any payment</option>
              {["PENDING", "AUTHORIZED", "PAID", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"].map((payment) => (
                <option key={payment} value={payment}>
                  {payment}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">Placed from</span>
            <input name="from" type="date" defaultValue={filters.dateFrom} className="mt-1 w-full rounded-md border bg-background px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Placed to</span>
            <input name="to" type="date" defaultValue={filters.dateTo} className="mt-1 w-full rounded-md border bg-background px-3 py-2" />
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-5">
            <button type="submit" className="rounded-md bg-[#8b5946] px-4 py-2 text-sm font-medium text-white hover:bg-[#7a4d3c]">
              Apply filters
            </button>
            <Link href="/admin/orders" className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
              Clear
            </Link>
          </div>
        </form>

        <div className="mt-6 overflow-hidden rounded-xl border bg-card">
          {orders.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No orders match these filters. Try clearing the filters or place an order from the storefront.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Order</th>
                    <th className="px-4 py-3 font-semibold">Date</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Items</th>
                    <th className="px-4 py-3 font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">Payment</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {orders.map((order) => (
                    <tr key={order.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/admin/orders/${order.id}`} className="font-medium text-[#8b5946] hover:underline">
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {order.createdAt.toLocaleDateString()} {order.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-4 py-3">{order.email}</td>
                      <td className="px-4 py-3">{order.items.length}</td>
                      <td className="px-4 py-3 font-medium">{formatCurrency(Number(order.grandTotal))}</td>
                      <td className="px-4 py-3">
                        {order.payments?.[0]?.provider ?? "—"} · {order.payments?.[0]?.status ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span data-testid={`order-row-status-${order.id}`} className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}