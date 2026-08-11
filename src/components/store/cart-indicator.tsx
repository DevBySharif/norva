"use client";

import { useCart } from "@/hooks/use-cart";

export function CartIndicator() {
  const { items, isHydrated } = useCart();
  const count = items.reduce((acc, item) => acc + item.quantity, 0);
  
  if (!isHydrated) return null;
  return count > 0 ? (
    <span className="absolute -right-2 -top-2 grid size-4 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">{count}</span>
  ) : null;
}
