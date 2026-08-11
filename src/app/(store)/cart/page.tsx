"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/hooks/use-cart";
import { useHydratedCart, type HydratedCartItem } from "@/hooks/use-hydrated-cart";
import { formatCurrency } from "@/lib/utils";
import { Minus, Plus, Trash2 } from "lucide-react";

export default function CartPage() {
  const { setQuantity, removeItem } = useCart();
  const { hydratedItems, isRefreshing } = useHydratedCart();

  if (hydratedItems === null) {
    return (
      <main className="mx-auto max-w-4xl p-6 sm:p-10">
        <h1 className="text-3xl font-semibold mb-8">Your Cart</h1>
        <div className="animate-pulse flex flex-col gap-6">
          <div className="h-32 bg-gray-100 rounded-lg"></div>
          <div className="h-32 bg-gray-100 rounded-lg"></div>
        </div>
      </main>
    );
  }

  if (hydratedItems.length === 0) {
    return (
      <main className="mx-auto max-w-4xl p-6 sm:p-10 text-center">
        <h1 className="text-3xl font-semibold mb-8">Your Cart</h1>
        <div className="bg-[#F0EEE6] p-10 rounded-2xl">
          <p className="text-gray-600 mb-6">Your cart is currently empty.</p>
          <Link href="/products" className="inline-block bg-[#D57959] text-white px-6 py-3 rounded-lg font-medium hover:bg-[#c26d50] transition-colors">
            Continue Shopping
          </Link>
        </div>
      </main>
    );
  }

  const subtotal = hydratedItems.reduce((acc, item) => {
    if (!item.isAvailable) return acc;
    const effectivePrice = item.salePrice ?? item.price;
    return acc + effectivePrice * item.quantity;
  }, 0);

  const canCheckout = hydratedItems.some((item) => item.isAvailable) && !isRefreshing;

  return (
    <main className="mx-auto max-w-4xl p-6 sm:p-10">
      <h1 className="text-3xl font-semibold mb-8">Your Cart</h1>

      <div className="flex flex-col lg:flex-row gap-10">
        <div className="flex-1 space-y-6">
          <ul className="divide-y divide-gray-200 border-t border-b border-gray-200">
            {hydratedItems.map((item: HydratedCartItem) => {
              const effectivePrice = item.salePrice ?? item.price;

              return (
                <li key={item.variantId} className={`py-6 flex gap-4 sm:gap-6 ${!item.isAvailable ? "opacity-60" : ""}`}>
                  <div className="shrink-0 w-24 h-24 sm:w-32 sm:h-32 bg-gray-100 rounded-md overflow-hidden relative">
                    {item.image ? (
                      <Image src={item.image.url} alt={item.image.altText ?? item.productName} fill className="object-cover" />
                    ) : null}
                  </div>

                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between">
                        <h3 className="font-medium text-gray-900 line-clamp-1">
                          <Link href={`/products/${item.productSlug}`} className="hover:underline">
                            {item.productName}
                          </Link>
                        </h3>
                        <p className="font-medium ml-4">{formatCurrency(effectivePrice)}</p>
                      </div>

                      {item.options.length > 0 && (
                        <p className="mt-1 text-sm text-gray-500">
                          {item.options.map((o) => o.value).join(" / ")}
                        </p>
                      )}

                      {item.salePrice && (
                        <p className="mt-1 text-xs text-gray-500 line-through">
                          {formatCurrency(item.price)}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex items-end justify-between">
                      {item.isAvailable ? (
                        <div className="flex items-center border border-gray-300 rounded-md">
                          <button
                            type="button"
                            aria-label="Decrease quantity"
                            disabled={item.quantity <= 1 || isRefreshing}
                            onClick={() => setQuantity(item.variantId, item.quantity - 1)}
                            className="p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <Minus className="size-4" />
                          </button>
                          <span data-testid="item-quantity" className="px-4 text-sm font-medium w-12 text-center select-none">{item.quantity}</span>
                          <button
                            type="button"
                            aria-label="Increase quantity"
                            disabled={item.quantity >= item.maxAvailable || isRefreshing}
                            onClick={() => setQuantity(item.variantId, item.quantity + 1)}
                            className="p-2 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                          >
                            <Plus className="size-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-sm font-medium text-red-600">
                          {item.reason === "unavailable" ? "Item unavailable" : "Out of stock"}
                        </span>
                      )}

                      <button
                        type="button"
                        aria-label={`Remove ${item.productName} from cart`}
                        onClick={() => removeItem(item.variantId)}
                        className="text-gray-400 hover:text-red-500 transition-colors p-2"
                      >
                        <Trash2 className="size-5" />
                      </button>
                    </div>

                    {item.isAvailable && (
                      <div className="mt-3 flex items-center justify-between border-t border-[#e5dfd3] pt-2 text-sm">
                        <span className="text-gray-500">Line subtotal</span>
                        <span data-testid="line-subtotal" className="font-medium">{formatCurrency(effectivePrice * item.quantity)}</span>
                      </div>
                    )}

                    {item.reason === "stock_adjusted" && (
                      <p className="mt-2 text-xs text-amber-600">
                        Quantity reduced to available stock ({item.maxAvailable}).
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="w-full lg:w-80 shrink-0">
          <div className="bg-[#F0EEE6]/50 border border-[#d8d0c3] rounded-2xl p-6">
            <h2 className="text-lg font-semibold mb-4">Order Summary</h2>

            <div className="space-y-4 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Shipping</span>
                <span className="text-gray-500 italic">Calculated at checkout</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Taxes</span>
                <span className="text-gray-500 italic">Calculated at checkout</span>
              </div>

              <div className="pt-4 border-t border-[#d8d0c3] flex justify-between items-end">
                <span className="text-base font-semibold">Estimated Total</span>
                <span className="text-lg font-bold">{formatCurrency(subtotal)}</span>
              </div>
            </div>

            {canCheckout ? (
              <Link href="/checkout" className="mt-8 block w-full bg-gray-900 text-white font-medium h-12 rounded-lg grid place-items-center hover:bg-gray-800 transition-colors">
                Proceed to checkout
              </Link>
            ) : (
              <button disabled className="mt-8 w-full bg-gray-900 text-white font-medium h-12 rounded-lg disabled:cursor-not-allowed disabled:opacity-50">
                Proceed to checkout
              </button>
            )}
            <p className="mt-3 text-xs text-center text-gray-500">Cash on Delivery available at checkout.</p>
          </div>
        </div>
      </div>
    </main>
  );
}