"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export type CartItemInput = {
  variantId: string;
  quantity: number;
};

type CartState = {
  version: number;
  items: CartItemInput[];
};

type CartContextType = {
  items: CartItemInput[];
  addItem: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  clearCart: () => void;
  isHydrated: boolean;
};

const CartContext = createContext<CartContextType | null>(null);

const CART_STORAGE_KEY = "norva_cart_v1";
const CURRENT_VERSION = 1;

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItemInput[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CartState;
        if (parsed.version === CURRENT_VERSION && Array.isArray(parsed.items)) {
          setItems(parsed.items);
        }
      }
    } catch (e) {
      console.error("Failed to parse cart from local storage", e);
      localStorage.removeItem(CART_STORAGE_KEY);
    }
    setIsHydrated(true);
  }, []);

  // Helper to update state and sync to localStorage synchronously
  const updateItems = useCallback((newItems: CartItemInput[] | ((prev: CartItemInput[]) => CartItemInput[])) => {
    setItems((prev) => {
      const next = typeof newItems === "function" ? newItems(prev) : newItems;
      localStorage.setItem(
        CART_STORAGE_KEY,
        JSON.stringify({ version: CURRENT_VERSION, items: next })
      );
      return next;
    });
  }, []);

  const addItem = useCallback((variantId: string, quantity: number) => {
    if (quantity <= 0 || !Number.isInteger(quantity)) return;
    updateItems((prev) => {
      const existingIdx = prev.findIndex((i) => i.variantId === variantId);
      if (existingIdx > -1) {
        const newItems = [...prev];
        newItems[existingIdx] = {
          ...newItems[existingIdx],
          quantity: newItems[existingIdx].quantity + quantity
        };
        return newItems;
      }
      return [...prev, { variantId, quantity }];
    });
  }, [updateItems]);

  const removeItem = useCallback((variantId: string) => {
    updateItems((prev) => prev.filter((i) => i.variantId !== variantId));
  }, [updateItems]);

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    if (quantity <= 0 || !Number.isInteger(quantity)) {
      removeItem(variantId);
      return;
    }
    updateItems((prev) =>
      prev.map((i) => (i.variantId === variantId ? { ...i, quantity } : i))
    );
  }, [removeItem, updateItems]);

  const clearCart = useCallback(() => {
    updateItems([]);
  }, [updateItems]);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, setQuantity, clearCart, isHydrated }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
