"use client";

import { useState, useMemo } from "react";
import { formatCurrency } from "@/lib/utils";
import { useCart } from "@/hooks/use-cart";

type SelectorProps = {
  basePrice: { toString(): string };
  compareAtPrice?: { toString(): string } | number | null;
  options?: Array<{
    id: string;
    name: string;
    values: Array<{ id: string; value: string; }>;
  }>;
  variants: Array<{
    id: string;
    name: string;
    price: { toString(): string } | null;
    salePrice: { toString(): string } | null;
    inventory: { quantity: number; reservedQuantity: number } | null;
    optionValues?: Array<{ optionValueId: string }>;
  }>;
};

export function VariantSelector({ basePrice, compareAtPrice, options, variants }: SelectorProps) {
  const { addItem } = useCart();
  const [added, setAdded] = useState(false);
  const hasOptions = options && options.length > 0;
  
  // Find first available variant or fallback to first variant
  const initialVariant = useMemo(() => {
    if (variants.length === 0) return null;
    const available = variants.find(v => (v.inventory?.quantity ?? 0) - (v.inventory?.reservedQuantity ?? 0) > 0);
    return available ?? variants[0];
  }, [variants]);

  const [selectedValues, setSelectedValues] = useState<Record<string, string>>(() => {
    if (!hasOptions || !initialVariant || !initialVariant.optionValues) return {};
    const initial: Record<string, string> = {};
    for (const opt of options) {
      const selectedVal = opt.values.find(v => initialVariant.optionValues!.some(ov => ov.optionValueId === v.id));
      if (selectedVal) initial[opt.id] = selectedVal.id;
    }
    return initial;
  });

  const selectedVariant = useMemo(() => {
    if (!hasOptions) return variants[0] ?? null;
    
    return variants.find(v => {
      if (!v.optionValues) return false;
      return options.every(opt => {
        const selectedId = selectedValues[opt.id];
        return selectedId ? v.optionValues!.some(ov => ov.optionValueId === selectedId) : false;
      });
    }) ?? null;
  }, [variants, options, selectedValues, hasOptions]);

  const price = selectedVariant 
    ? Number(selectedVariant.salePrice ?? selectedVariant.price ?? basePrice)
    : Number(basePrice);
    
  const compareAt = selectedVariant?.salePrice ? Number(selectedVariant.price ?? basePrice) : (compareAtPrice != null ? Number(compareAtPrice) : null);
  const available = selectedVariant ? (selectedVariant.inventory?.quantity ?? 0) - (selectedVariant.inventory?.reservedQuantity ?? 0) : 0;

  const handleSelect = (optionId: string, valueId: string) => {
    setAdded(false);
    setSelectedValues(prev => ({ ...prev, [optionId]: valueId }));
  };

  const handleAddToCart = () => {
    if (selectedVariant && available > 0) {
      addItem(selectedVariant.id, 1);
      setAdded(true);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-3">
        <p className="text-2xl font-semibold tracking-tight text-foreground">{formatCurrency(price)}</p>
        {compareAt && (
          <p className="text-sm font-medium text-muted-foreground line-through">
            {formatCurrency(compareAt)}
          </p>
        )}
      </div>
      
      <p className="mt-2 text-sm font-medium text-[#554a41]">
        {available > 0 ? (
          <span className="text-[#4a6a42]">In stock</span>
        ) : (
          <span className="text-[#a04b3c]">Out of stock</span>
        )}
      </p>

      {hasOptions && (
        <div className="mt-6 space-y-5">
          {options.map((option) => (
            <div key={option.id}>
              <h3 className="text-sm font-semibold text-foreground">{option.name}</h3>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {option.values.map((val) => {
                  const isSelected = selectedValues[option.id] === val.id;
                  
                  // Check if this value exists in any variant
                  const isAvailable = variants.some(v => 
                    v.optionValues?.some(ov => ov.optionValueId === val.id)
                  );

                  return (
                    <button
                      type="button"
                      key={val.id}
                      onClick={() => handleSelect(option.id, val.id)}
                      disabled={!isAvailable}
                      className={`min-w-[3rem] rounded-[3px] border px-3 py-2 text-sm font-medium transition-colors
                        ${isSelected 
                          ? "border-[#d57959] bg-[#d57959] text-primary-foreground" 
                          : isAvailable 
                            ? "border-[#bcae9d] bg-[#fffdf7]/60 text-foreground hover:border-[#9f8c78] hover:bg-[#fffdf7]" 
                            : "cursor-not-allowed border-[#d8d0c3] bg-[#e8e2d9] text-muted-foreground opacity-60"
                        }`}
                      aria-pressed={isSelected}
                    >
                      {val.value}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <button 
        type="button"
        disabled={!selectedVariant || available <= 0} 
        onClick={handleAddToCart}
        className="mt-8 h-12 w-full rounded-[3px] bg-primary px-8 text-base font-semibold text-primary-foreground transition-colors duration-200 hover:bg-[#c96b4e] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {selectedVariant && available > 0 ? "Add to cart" : "Unavailable"}
      </button>
      {added && <p role="status" className="mt-2 text-sm font-medium text-[#4a6a42]">Item added. Open the cart to review quantities.</p>}
    </div>
  );
}
