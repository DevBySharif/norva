import Link from "next/link";
import { notFound } from "next/navigation";
import type { OrderStatus } from "@prisma/client";
import { formatCurrency } from "@/lib/utils";
import { getAdminOrderById } from "@/features/orders/admin-queries";
import { availableTransitionsFrom, FORWARD_FLOW } from "@/features/orders/state-machine";
import { OrderStatusActions } from "@/components/admin/order-actions";

export const dynamic = "force-dynamic";

const statusStyles: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-blue-100 text-blue-800",
  PROCESSING: "bg-indigo-100 text-indigo-800",
  SHIPPED: "bg-violet-100 text-violet-800",
  DELIVERED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-zinc-100 text-zinc-600",
  REFUNDED: "bg-zinc-100 text-zinc-600",
};

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await getAdminOrderById(id);
  if (!order) notFound();

  const address = order.shippingAddress as Record<string, string | null> | null;
  const transitions = availableTransitionsFrom(order.status as OrderStatus);

  return (
    <main className="admin-paper min-h-[calc(100vh-4rem)] px-4 py-7 sm:px-7 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin/orders" className="text-sm text-[#8b5946] hover:underline">← Back to orders</Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#8b5946]">Order</p>
          <span data-testid="order-status-badge" className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[order.status] ?? "bg-muted text-muted-foreground"}`}>
            {order.status}
          </span>
        </div>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{order.orderNumber}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Placed {order.createdAt.toLocaleString()}</p>

        <div className="mt-7 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Customer</h2>
            <dl className="mt-3 divide-y text-sm">
              <Row label="Email" value={order.email} />
              <Row label="Status" value={order.status} />
              <Row label="Payment" value={`${order.payments?.[0]?.provider ?? "—"} · ${order.payments?.[0]?.status ?? "—"}`} />
              {order.payments?.[0]?.amount != null && <Row label="Payment amount" value={formatCurrency(Number(order.payments[0].amount))} />}
            </dl>
          </section>
          <OrderStatusActions orderId={order.id} availableTransitions={transitions} payment={{ provider: order.payments?.[0]?.provider ?? null, status: order.payments?.[0]?.status ?? null }} />
        </div>

        <section className="mt-6 rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Shipping address</h2>
          <div className="mt-3 text-sm leading-6">
            <p className="font-medium">{address?.line1}</p>
            {address?.line2 ? <p>{address.line2}</p> : null}
            <p>
              {address?.city}, {address?.state} {address?.postalCode}
            </p>
            <p>{address?.country}</p>
          </div>
        </section>

        <section className="mt-6 rounded-xl border bg-card">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Items</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-semibold">Product</th>
                  <th className="px-5 py-2 font-semibold">Variant / SKU</th>
                  <th className="px-5 py-2 font-semibold">Qty</th>
                  <th className="px-5 py-2 font-semibold">Unit</th>
                  <th className="px-5 py-2 font-semibold">Line total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {order.items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-3 font-medium">{item.productName}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {item.variantName ?? "Default"} · {item.sku}
                    </td>
                    <td className="px-5 py-3">{item.quantity}</td>
                    <td className="px-5 py-3">{formatCurrency(Number(item.unitPrice))}</td>
                    <td className="px-5 py-3 font-medium">{formatCurrency(Number(item.lineTotal))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="border-t px-5 py-4 text-sm">
            <Row label="Subtotal" value={formatCurrency(Number(order.subtotal))} />
            <Row label="Shipping" value={Number(order.shippingTotal) === 0 ? "Free" : formatCurrency(Number(order.shippingTotal))} />
            <Row label="Tax" value={formatCurrency(Number(order.taxTotal))} />
            <Row label="Discount" value={formatCurrency(Number(order.discountTotal))} />
            <div className="flex justify-between gap-6 pt-2 text-base">
              <dt className="font-semibold">Grand total</dt>
              <dd className="font-bold">{formatCurrency(Number(order.grandTotal))}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-6 rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            History <span className="font-normal normal-case">({FORWARD_FLOW.join(" → ")}; cancellation allowed before shipping)</span>
          </h2>
          <ol data-testid="order-timeline" className="mt-4 space-y-3">
            {order.statusHistory.map((entry, index) => (
              <li key={`${entry.createdAt.toISOString()}-${index}`} className="rounded-lg border bg-background p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[entry.status] ?? "bg-muted text-muted-foreground"}`}>
                    {entry.status}
                  </span>
                  {entry.fromStatus && (
                    <span className="text-xs text-muted-foreground">
                      from {entry.fromStatus}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">{entry.createdAt.toLocaleString()}</span>
                  {entry.actorType && <span className="text-xs uppercase tracking-wide text-muted-foreground">{entry.actorType}</span>}
                </div>
                {entry.note ? <p className="mt-1.5 text-sm text-foreground">— {entry.note}</p> : null}
                {entry.internalNote ? (
                  <p className="mt-1.5 rounded bg-muted/60 px-2 py-1 text-xs text-muted-foreground" data-testid="internal-note">
                    Internal: {entry.internalNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right">{value}</dd>
    </div>
  );
}