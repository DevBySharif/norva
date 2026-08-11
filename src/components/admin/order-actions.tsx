"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markPaymentReceived, updateOrderStatus, type OrderActionResult } from "@/features/orders/admin-actions";

type Props = {
  orderId: string;
  availableTransitions: string[];
  payment: { provider: string | null; status: string | null } | null;
};

export function OrderStatusActions({ orderId, availableTransitions, payment }: Props) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result: OrderActionResult = await updateOrderStatus({
        orderId,
        toStatus: formData.get("toStatus"),
        note: formData.get("note"),
        internalNote: formData.get("internalNote"),
      });
      if (result.ok) {
        setMessage({ kind: "success", text: `Order moved to ${result.toStatus.replace(/_/g, " ").toLowerCase()}.` });
        formRef.current?.reset();
        router.refresh();
      } else {
        setMessage({ kind: "error", text: result.message });
      }
    });
  }

  function markPaid(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    startTransition(async () => {
      const result: OrderActionResult = await markPaymentReceived({ orderId });
      if (result.ok) {
        setMessage({ kind: "success", text: "Payment received." });
        router.refresh();
      } else setMessage({ kind: "error", text: result.message });
    });
  }

  const canMarkPaid = payment?.provider === "COD" && payment?.status === "PENDING";

  return (
    <section aria-labelledby="order-actions-heading" className="rounded-xl border bg-card p-5">
      <h2 id="order-actions-heading" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Update order
      </h2>

      {availableTransitions.length > 0 ? (
        <form ref={formRef} onSubmit={apply} className="mt-3 space-y-3">
          <div>
            <label htmlFor="order-status-select" className="text-sm font-medium">
              Move to
            </label>
            <select
              id="order-status-select"
              name="toStatus"
              data-testid="order-status-select"
              required
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              defaultValue={availableTransitions[0]}
            >
              {availableTransitions.map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="order-status-note" className="text-sm font-medium">
              Note to customer (optional)
            </label>
            <input
              id="order-status-note"
              name="note"
              data-testid="order-status-note"
              maxLength={500}
              placeholder="Shown to the customer on their order page"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="order-status-internal-note" className="text-sm font-medium">
              Internal note (staff only, optional)
            </label>
            <input
              id="order-status-internal-note"
              name="internalNote"
              data-testid="order-status-internal-note"
              maxLength={1000}
              placeholder="Not shown to the customer"
              className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={isPending}
            data-testid="order-status-apply"
            className="w-full rounded-md bg-[#8b5946] px-4 py-2 text-sm font-medium text-white hover:bg-[#7a4d3c] disabled:opacity-50"
          >
            {isPending ? "Updating…" : "Apply status change"}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">No further status changes are available for this order.</p>
      )}

      {canMarkPaid && (
        <form onSubmit={markPaid} className="mt-4">
          <button
            type="submit"
            disabled={isPending}
            data-testid="payment-mark-received"
            className="rounded-md border border-[#8b5946] px-4 py-2 text-sm font-medium text-[#8b5946] hover:bg-[#8b5946]/5 disabled:opacity-50"
          >
            {isPending ? "Saving…" : "Mark payment received (COD)"}
          </button>
        </form>
      )}

      {message && (
        <p role="status" data-testid="order-action-message" className={message.kind === "error" ? "mt-3 text-sm font-medium text-destructive" : "mt-3 text-sm font-medium text-emerald-700"}>
          {message.text}
        </p>
      )}
    </section>
  );
}