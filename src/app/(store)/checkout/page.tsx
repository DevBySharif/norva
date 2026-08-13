"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/hooks/use-cart";
import { useHydratedCart, type HydratedCartItem } from "@/hooks/use-hydrated-cart";
import { formatCurrency } from "@/lib/utils";
import { ProductMediaFallback } from "@/components/store/product-media-fallback";
import { placeOrder, getShippingMethodsPublic } from "@/features/orders/actions";
import { previewCheckoutTotals } from "@/features/coupons/actions";
import { getCheckoutPrefill } from "@/features/customers/actions";
import { freeShippingDefault, type PublicShippingMethod } from "@/features/orders/constants";

type CheckoutFormState = {
  fullName: string;
  email: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

const initialForm: CheckoutFormState = { fullName: "", email: "", phone: "", line1: "", line2: "", city: "", state: "", postalCode: "", country: "" };

export default function CheckoutPage() {
  const router = useRouter();
  const { isHydrated } = useCart();
  const { hydratedItems, isRefreshing, rehydrate, clearCart } = useHydratedCart();

  const [form, setForm] = useState<CheckoutFormState>(initialForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topMessage, setTopMessage] = useState<string | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);
  const [shippingMethods, setShippingMethods] = useState<PublicShippingMethod[]>([]);
  const [shippingCode, setShippingCode] = useState<string>(freeShippingDefault.code);
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "ONLINE">("COD");
  
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [dynamicTotals, setDynamicTotals] = useState<{ subtotal: string, shippingTotal: string, discountTotal: string, grandTotal: string } | null>(null);

  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    getShippingMethodsPublic().then(setShippingMethods).catch(() => setShippingMethods([]));
    getCheckoutPrefill()
      .then((prefill) => {
        if (!prefill) return;
        setIsLoggedIn(true);
        setForm((f) => ({
          ...f,
          fullName: f.fullName || prefill.customer.fullName,
          email: f.email || prefill.customer.email,
          phone: f.phone || prefill.customer.phone,
        }));
        if (prefill.shippingAddress) {
          setForm((f) => ({
            ...f,
            line1: f.line1 || prefill.shippingAddress!.line1,
            line2: f.line2 || prefill.shippingAddress!.line2,
            city: f.city || prefill.shippingAddress!.city,
            state: f.state || prefill.shippingAddress!.state,
            postalCode: f.postalCode || prefill.shippingAddress!.postalCode,
            country: f.country || prefill.shippingAddress!.country,
          }));
        }
      })
      .catch(() => {});
  }, []);

  const setField = (key: keyof CheckoutFormState, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (fieldErrors[key]) setFieldErrors((e) => { const next = { ...e }; delete next[key]; return next; });
    setTopMessage(null);
  };

  const availableItems = (hydratedItems ?? []).filter((i) => i.isAvailable);
  const hasUnavailable = (hydratedItems ?? []).some((i) => !i.isAvailable);

  const subtotal = availableItems.reduce((acc, item) => {
    const effectivePrice = item.salePrice ?? item.price;
    return acc + effectivePrice * item.quantity;
  }, 0);

  useEffect(() => {
    if (!isHydrated || !hydratedItems || hydratedItems.length === 0) return;
    previewCheckoutTotals(subtotal.toString(), appliedCoupon || undefined).then(res => {
      setDynamicTotals(res);
      if (res.couponError && appliedCoupon) {
        setCouponError(res.couponError);
        setAppliedCoupon(null);
      }
    });
  }, [subtotal, appliedCoupon, isHydrated, hydratedItems]);

  const selectedMethod = shippingMethods.find((m) => m.code === shippingCode) ?? (shippingCode === freeShippingDefault.code ? freeShippingDefault : null);
  const shippingTotal = dynamicTotals ? Number(dynamicTotals.shippingTotal) : (selectedMethod ? Number(selectedMethod.price) : 0);
  const discountTotal = dynamicTotals ? Number(dynamicTotals.discountTotal) : 0;
  const grandTotal = dynamicTotals ? Number(dynamicTotals.grandTotal) : subtotal + shippingTotal;

  async function handleApplyCoupon() {
    setIsApplyingCoupon(true);
    setCouponError(null);
    const res = await previewCheckoutTotals(subtotal.toString(), couponInput);
    if (res.couponError) {
      setCouponError(res.couponError);
      setAppliedCoupon(null);
    } else if (res.validCoupon) {
      setAppliedCoupon(res.validCoupon.code);
      setCouponInput("");
    }
    setDynamicTotals(res);
    setIsApplyingCoupon(false);
  }

  function handleRemoveCoupon() {
    setAppliedCoupon(null);
    setCouponError(null);
  }

  const canPlaceOrder = !isPlacing && !isRefreshing && isHydrated && hydratedItems !== null && hydratedItems.length > 0 && !hasUnavailable;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canPlaceOrder || !hydratedItems) return;

    setIsPlacing(true);
    setTopMessage(null);
    setFieldErrors({});

    const response = await placeOrder({
      items: availableItems.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      customer: { fullName: form.fullName, email: form.email, phone: form.phone },
      shippingAddress: {
        line1: form.line1,
        line2: form.line2,
        city: form.city,
        state: form.state,
        postalCode: form.postalCode,
        country: form.country,
      },
      shippingMethodCode: shippingCode === freeShippingDefault.code ? undefined : shippingCode,
      couponCode: appliedCoupon || undefined,
      paymentMethod,
      idempotencyKey,
      saveAddress,
    });

    setIsPlacing(false);

    if (response.ok) {
      clearCart();
      if (response.paymentRedirectUrl) {
        window.location.href = response.paymentRedirectUrl;
      } else {
        router.push(`/order-success/${response.orderNumber}`);
      }
      return;
    }

    if ("fieldErrors" in response && Object.keys(response.fieldErrors).length > 0) {
      setFieldErrors(response.fieldErrors);
      setTopMessage(response.message);
    } else {
      setTopMessage(response.message);
    }

    if (response.code === "out_of_stock" || response.code === "unavailable") rehydrate();
  }

  if (!isHydrated || hydratedItems === null) {
    return (
      <main className="mx-auto max-w-7xl p-6 sm:p-10">
        <h1 className="text-3xl font-semibold mb-8">Checkout</h1>
        <div className="animate-pulse flex flex-col gap-6">
          <div className="h-40 bg-gray-100 rounded-lg"></div>
          <div className="h-40 bg-gray-100 rounded-lg"></div>
        </div>
      </main>
    );
  }

  if (hydratedItems.length === 0) {
    return (
      <main className="mx-auto max-w-7xl p-6 sm:p-10 text-center">
        <h1 className="text-3xl font-semibold mb-8">Checkout</h1>
        <div className="bg-[#F0EEE6] p-10 rounded-2xl">
          <p className="text-gray-600 mb-6">Your cart is empty — nothing to check out yet.</p>
          <Link href="/products" className="inline-block bg-[#D57959] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#c26d50] transition-colors">
            Continue Shopping
          </Link>
        </div>
      </main>
    );
  }

  const inputClass = (hasError: boolean) =>
    `mt-1.5 block min-h-11 w-full rounded-md border bg-[#fffdf7]/80 px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground/70 focus:border-primary ${
      hasError ? "border-red-600" : "border-[#d8d0c3]"
    }`;

  const errorMsg = (key: string) => (fieldErrors[key] ? <p id={`error-${key.replaceAll(".", "-")}`} className="mt-1 text-xs text-red-600">{fieldErrors[key]}</p> : null);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-3xl font-semibold">Checkout</h1>
      </div>

      {hasUnavailable && (
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          Some items in your cart are no longer available. Remove them before placing your order.
        </div>
      )}

      {topMessage && (
        <div className="mt-5 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert" data-testid="checkout-error">
          {topMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="mt-8 grid gap-10 lg:grid-cols-[1fr_400px]">
        <div className="space-y-10">
          <section aria-labelledby="contact-heading" className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-6">
            <h2 id="contact-heading" className="text-lg font-semibold">Contact information</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold" htmlFor="customer.fullName">Full name</label>
                <input id="customer.fullName" name="customer.fullName" className={inputClass(!!fieldErrors["customer.fullName"])} aria-invalid={!!fieldErrors["customer.fullName"]} aria-describedby={fieldErrors["customer.fullName"] ? "error-customer-fullName" : undefined} value={form.fullName} onChange={(e) => setField("fullName", e.target.value)} autoComplete="name" required />
                {errorMsg("customer.fullName")}
              </div>
              <div>
                <label className="block text-sm font-semibold" htmlFor="customer.email">Email</label>
                <input id="customer.email" name="customer.email" type="email" className={inputClass(!!fieldErrors["customer.email"])} aria-invalid={!!fieldErrors["customer.email"]} aria-describedby={fieldErrors["customer.email"] ? "error-customer-email" : undefined} value={form.email} onChange={(e) => setField("email", e.target.value)} autoComplete="email" required />
                {errorMsg("customer.email")}
              </div>
              <div>
                <label className="block text-sm font-semibold" htmlFor="customer.phone">Phone</label>
                <input id="customer.phone" name="customer.phone" type="tel" className={inputClass(!!fieldErrors["customer.phone"])} aria-invalid={!!fieldErrors["customer.phone"]} aria-describedby={fieldErrors["customer.phone"] ? "error-customer-phone" : undefined} value={form.phone} onChange={(e) => setField("phone", e.target.value)} autoComplete="tel" required />
                {errorMsg("customer.phone")}
              </div>
            </div>
          </section>

          <section aria-labelledby="address-heading" className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-6">
            <h2 id="address-heading" className="text-lg font-semibold">Shipping address</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold" htmlFor="shippingAddress.line1">Address line 1</label>
                <input id="shippingAddress.line1" name="shippingAddress.line1" className={inputClass(!!fieldErrors["shippingAddress.line1"])} aria-invalid={!!fieldErrors["shippingAddress.line1"]} aria-describedby={fieldErrors["shippingAddress.line1"] ? "error-shippingAddress-line1" : undefined} value={form.line1} onChange={(e) => setField("line1", e.target.value)} autoComplete="address-line1" required />
                {errorMsg("shippingAddress.line1")}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold" htmlFor="shippingAddress.line2">Address line 2 <span className="font-normal text-muted-foreground">(optional)</span></label>
                <input id="shippingAddress.line2" name="shippingAddress.line2" className={inputClass(false)} value={form.line2} onChange={(e) => setField("line2", e.target.value)} autoComplete="address-line2" />
              </div>
              <div>
                <label className="block text-sm font-semibold" htmlFor="shippingAddress.city">City</label>
                <input id="shippingAddress.city" name="shippingAddress.city" className={inputClass(!!fieldErrors["shippingAddress.city"])} aria-invalid={!!fieldErrors["shippingAddress.city"]} aria-describedby={fieldErrors["shippingAddress.city"] ? "error-shippingAddress-city" : undefined} value={form.city} onChange={(e) => setField("city", e.target.value)} autoComplete="address-level2" required />
                {errorMsg("shippingAddress.city")}
              </div>
              <div>
                <label className="block text-sm font-semibold" htmlFor="shippingAddress.state">State / region</label>
                <input id="shippingAddress.state" name="shippingAddress.state" className={inputClass(!!fieldErrors["shippingAddress.state"])} aria-invalid={!!fieldErrors["shippingAddress.state"]} aria-describedby={fieldErrors["shippingAddress.state"] ? "error-shippingAddress-state" : undefined} value={form.state} onChange={(e) => setField("state", e.target.value)} autoComplete="address-level1" required />
                {errorMsg("shippingAddress.state")}
              </div>
              <div>
                <label className="block text-sm font-semibold" htmlFor="shippingAddress.postalCode">Postal code</label>
                <input id="shippingAddress.postalCode" name="shippingAddress.postalCode" className={inputClass(!!fieldErrors["shippingAddress.postalCode"])} aria-invalid={!!fieldErrors["shippingAddress.postalCode"]} aria-describedby={fieldErrors["shippingAddress.postalCode"] ? "error-shippingAddress-postalCode" : undefined} value={form.postalCode} onChange={(e) => setField("postalCode", e.target.value)} autoComplete="postal-code" required />
                {errorMsg("shippingAddress.postalCode")}
              </div>
              <div>
                <label className="block text-sm font-semibold" htmlFor="shippingAddress.country">Country</label>
                <input id="shippingAddress.country" name="shippingAddress.country" className={inputClass(!!fieldErrors["shippingAddress.country"])} aria-invalid={!!fieldErrors["shippingAddress.country"]} aria-describedby={fieldErrors["shippingAddress.country"] ? "error-shippingAddress-country" : undefined} value={form.country} onChange={(e) => setField("country", e.target.value)} autoComplete="country-name" required />
                {errorMsg("shippingAddress.country")}
              </div>
            </div>
            {isLoggedIn && (
              <label className="mt-4 flex items-center gap-3" data-testid="save-address-wrap">
                <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} data-testid="save-address" className="size-4 accent-[#D57959]" />
                <span className="text-sm font-medium">Save this address to my account</span>
              </label>
            )}
          </section>

          <section aria-labelledby="delivery-heading" className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-6">
            <h2 id="delivery-heading" className="text-lg font-semibold">Delivery method</h2>
            <div className="mt-4 space-y-2">
              <label className={`flex items-center justify-between rounded-lg border px-4 py-3 ${shippingCode === freeShippingDefault.code ? "border-[#D57959]" : "border-[#d8d0c3]"}`}>
                <span className="flex items-center gap-3">
                  <input type="radio" name="shippingMethod" value={freeShippingDefault.code} checked={shippingCode === freeShippingDefault.code} onChange={() => setShippingCode(freeShippingDefault.code)} />
                  <span>
                    <span className="block text-sm font-medium">{freeShippingDefault.name}</span>
                    <span className="block text-xs text-muted-foreground">No shipping charge configured on this store.</span>
                  </span>
                </span>
                <span className="text-sm font-semibold">{formatCurrency(0)}</span>
              </label>
              {shippingMethods.map((method) => (
                <label key={method.id} className={`flex items-center justify-between rounded-lg border px-4 py-3 ${shippingCode === method.code ? "border-[#D57959]" : "border-[#d8d0c3]"}`}>
                  <span className="flex items-center gap-3">
                    <input type="radio" name="shippingMethod" value={method.code} checked={shippingCode === method.code} onChange={() => setShippingCode(method.code)} />
                    <span className="block text-sm font-medium">{method.name}</span>
                  </span>
                  <span className="text-sm font-semibold">{formatCurrency(Number(method.price))}</span>
                </label>
              ))}
            </div>
          </section>

          <section aria-labelledby="payment-method-heading" className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-6">
            <h2 id="payment-method-heading" className="text-lg font-semibold">Payment method</h2>
            <div className="mt-4 space-y-2">
              <label className={`flex items-center justify-between rounded-lg border px-4 py-3 ${paymentMethod === "ONLINE" ? "border-[#D57959]" : "border-[#d8d0c3]"}`}>
                <span className="flex items-center gap-3">
                  <input type="radio" name="paymentMethod" value="ONLINE" checked={paymentMethod === "ONLINE"} onChange={() => setPaymentMethod("ONLINE")} />
                  <span>
                    <span className="block text-sm font-medium">Pay securely online</span>
                    <span className="block text-xs text-muted-foreground">Cards, Mobile Banking, Internet Banking</span>
                  </span>
                </span>
              </label>
              <label className={`flex items-center justify-between rounded-lg border px-4 py-3 ${paymentMethod === "COD" ? "border-[#D57959]" : "border-[#d8d0c3]"}`}>
                <span className="flex items-center gap-3">
                  <input type="radio" name="paymentMethod" value="COD" checked={paymentMethod === "COD"} onChange={() => setPaymentMethod("COD")} />
                  <span>
                    <span className="block text-sm font-medium">Cash on Delivery</span>
                    <span className="block text-xs text-muted-foreground">Pay with cash when your order is delivered.</span>
                  </span>
                </span>
              </label>
            </div>
          </section>
        </div>

        <aside aria-label="Order summary" className="h-fit rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/50 p-6 lg:sticky lg:top-6">
          <h2 className="text-lg font-semibold mb-4">Your order</h2>
          <ul className="divide-y divide-[#d8d0c3]">
            {hydratedItems.map((item: HydratedCartItem) => {
              const effectivePrice = item.salePrice ?? item.price;
              return (
                <li key={item.variantId} className={`py-4 flex gap-4 ${!item.isAvailable ? "opacity-60" : ""}`}>
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-gray-100">
                    {item.image ? <Image src={item.image.url} alt={item.image.altText ?? item.productName} fill className="object-cover" /> : <ProductMediaFallback name={item.productName} className="p-1" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 line-clamp-1">{item.productName}</p>
                    {item.options.length > 0 && <p className="text-sm text-gray-500">{item.options.map((o) => o.value).join(" / ")}</p>}
                    <p className="mt-1 text-sm text-gray-600">
                      {item.quantity} × {formatCurrency(effectivePrice)}
                      {item.salePrice ? <span className="ml-1 text-xs text-gray-400 line-through">{formatCurrency(item.price)}</span> : null}
                    </p>
                  </div>
                  <p className="text-sm font-medium">{formatCurrency(effectivePrice * item.quantity)}</p>
                </li>
              );
            })}
          </ul>

          <dl className="mt-4 space-y-3 border-t border-[#d8d0c3] pt-4 text-sm">
            
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold">Discount code</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value)}
                  placeholder="Enter coupon code"
                  disabled={isApplyingCoupon || !!appliedCoupon}
                  className="block w-full rounded-md border border-[#d8d0c3] px-3 py-2 text-sm shadow-sm focus:border-[#D57959] focus:outline-none"
                />
                {!appliedCoupon ? (
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={!couponInput || isApplyingCoupon}
                    className="shrink-0 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-50"
                  >
                    Apply
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="shrink-0 rounded-md bg-red-100 px-4 py-2 text-sm font-medium text-red-700 shadow-sm hover:bg-red-200"
                  >
                    Remove
                  </button>
                )}
              </div>
              {couponError && <p className="text-xs text-red-600 mt-1">{couponError}</p>}
              {appliedCoupon && <p className="text-xs text-green-700 mt-1">Coupon {appliedCoupon} applied!</p>}
            </div>

            <div className="flex justify-between border-t border-[#d8d0c3] pt-3">
              <dt className="text-gray-600">Subtotal</dt>
              <dd className="font-medium">{formatCurrency(subtotal)}</dd>
            </div>
            
            {discountTotal > 0 && (
              <div className="flex justify-between text-green-700">
                <dt>Discount {appliedCoupon ? `(${appliedCoupon})` : ""}</dt>
                <dd className="font-medium">-{formatCurrency(discountTotal)}</dd>
              </div>
            )}

            <div className="flex justify-between">
              <dt className="text-gray-600">Shipping</dt>
              <dd className="font-medium">{shippingTotal === 0 ? "Free" : formatCurrency(shippingTotal)}</dd>
            </div>
            <div className="flex justify-between text-base font-semibold border-t border-[#d8d0c3] pt-3">
              <dt>Total</dt>
              <dd data-testid="checkout-total">{formatCurrency(grandTotal)}</dd>
            </div>
          </dl>

          <button
            type="submit"
            disabled={!canPlaceOrder}
            data-testid="place-order"
            className="mt-6 h-12 w-full rounded-lg bg-[#D57959] text-white font-medium transition-colors hover:bg-[#c26d50] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPlacing ? "Processing…" : hasUnavailable ? "Review cart to continue" : paymentMethod === "ONLINE" ? "Proceed to Payment" : "Place order"}
          </button>
          <p className="mt-3 text-center text-xs text-gray-500">
            {paymentMethod === "COD" ? `By placing your order you agree to pay ${formatCurrency(grandTotal)} on delivery.` : "You will be redirected to our secure payment gateway."}
          </p>
        </aside>
      </form>
    </main>
  );
}
