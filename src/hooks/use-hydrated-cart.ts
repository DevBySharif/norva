"use client";

import { useCallback, useEffect, useState } from "react";
import { useCart } from "@/hooks/use-cart";
import { hydrateCart } from "@/features/cart/actions";

export type HydratedCartItem = {
  variantId: string;
  quantity: number;
  requestedQuantity: number;
  isAvailable: boolean;
  reason: "out_of_stock" | "stock_adjusted" | "unavailable" | null;
  price: number;
  salePrice: number | null;
  productName: string;
  productSlug: string;
  image: { url: string; altText: string | null } | null;
  options: { name: string; value: string }[];
  maxAvailable: number;
};

export function useHydratedCart() {
  const { items, isHydrated, clearCart } = useCart();
  const [hydratedItems, setHydratedItems] = useState<HydratedCartItem[] | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const rehydrate = useCallback(() => setRefreshToken((t) => t + 1), []);

  useEffect(() => {
    if (!isHydrated) return;
    if (items.length === 0) {
      setHydratedItems([]);
      return;
    }
    let isMounted = true;
    setIsRefreshing(true);
    hydrateCart(items)
      .then((result) => {
        if (!isMounted) return;
        setHydratedItems(result);
        setIsRefreshing(false);
      })
      .catch(() => {
        if (isMounted) setIsRefreshing(false);
      });
    return () => {
      isMounted = false;
    };
  }, [items, isHydrated, refreshToken]);

  return { hydratedItems, isRefreshing, rehydrate, clearCart };
}