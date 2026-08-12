import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { getPaymentProvider } from "@/features/payments";
import { reconcilePayment } from "@/features/payments/reconciliation";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Payment Result" };

export const dynamic = "force-dynamic";

export default async function PaymentReturnPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const session = await getCurrentUser();
  const user = session?.user && session.user.role === "CUSTOMER" ? session.user : null;
  const query = await searchParams;
  
  // SSLCOMMERZ / Test Provider uses `tran_id` or `merchantReference`
  const orderNumber = query.tran_id || query.merchantReference || query.orderNumber;
  
  if (!orderNumber) {
    return (
      <main className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold text-red-600 mb-4">Invalid Payment Request</h1>
        <p className="text-gray-600 mb-6">We could not identify your order from the payment gateway return.</p>
        <Link href="/account/orders" className="text-white bg-[#D57959] hover:bg-[#c46949] font-medium rounded-lg text-sm px-5 py-2.5">
          View My Orders
        </Link>
      </main>
    );
  }

  // Find order to ensure ownership
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: { payments: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  if (!order) {
    notFound();
  }

  // Ownership check
  if (order.userId) {
    if (!user || user.id !== order.userId) notFound();
  } else {
    // Guest order: Check if lookup token was passed in the return URL or if it's stored in session/cookies
    // In our implementation, we'll append lookup_token to the callback URL from the payment gateway.
    const lookupToken = query.lookup_token || query.lookupToken;
    if (order.lookupToken !== lookupToken) notFound();
  }

  // Try to reconcile if we haven't already
  const latestPayment = order.payments[0];
  let currentStatus: string | undefined = latestPayment?.status;

  if (currentStatus === "PENDING") {
    try {
      const provider = getPaymentProvider();
      const validation = await provider.verifyCallback(query);
      if (validation.ok) {
        const result = await reconcilePayment(orderNumber, validation);
        if (result.ok) {
          currentStatus = validation.status;
        }
      }
    } catch (err) {
      console.error("Failed to reconcile during return page:", err);
    }
  }

  if (currentStatus === "PAID") {
    redirect(`/order-success/${orderNumber}`);
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-20 text-center">
      {currentStatus === "FAILED" || currentStatus === "CANCELLED" ? (
        <>
          <h1 className="text-2xl font-semibold text-red-600 mb-4">Payment {currentStatus === "CANCELLED" ? "Cancelled" : "Failed"}</h1>
          <p className="text-gray-600 mb-6">Your payment was not successful. Your order has been saved, and you can try paying again.</p>
          <div className="flex justify-center gap-4">
            <Link href={order.userId ? `/account/orders/${orderNumber}` : `/orders/${orderNumber}?access=${order.lookupToken}`} className="text-white bg-[#D57959] hover:bg-[#c46949] font-medium rounded-lg text-sm px-5 py-2.5">
              Retry Payment
            </Link>
          </div>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold text-gray-800 mb-4">Processing Payment...</h1>
          <p className="text-gray-600 mb-6">We are waiting for confirmation from the payment provider. This page may take a few moments to update.</p>
          <div className="flex justify-center gap-4">
             <Link href={order.userId ? `/account/orders/${orderNumber}` : `/orders/${orderNumber}?access=${order.lookupToken}`} className="text-[#D57959] bg-transparent border border-[#D57959] hover:bg-[#D57959] hover:text-white font-medium rounded-lg text-sm px-5 py-2.5 transition-colors">
              Refresh Status
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
