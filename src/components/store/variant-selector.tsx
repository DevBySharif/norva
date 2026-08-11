"use client";

import { useState, useMemo } from "react";
import { formatCurrency } from "@/lib/utils";
import { useCart } from "@/hooks/use-cart";

type SelectorProps = {
  basePrice: { toString(): string };
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

export function VariantSelector({ basePrice, options, variants }: SelectorProps) {
  const { addItem } = useCart();
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
    
  const compareAt = selectedVariant?.salePrice ? Number(selectedVariant.price ?? basePrice) : null;
  const available = selectedVariant ? (selectedVariant.inventory?.quantity ?? 0) - (selectedVariant.inventory?.reservedQuantity ?? 0) : 0;

  const handleSelect = (optionId: string, valueId: string) => {
    setSelectedValues(prev => ({ ...prev, [optionId]: valueId }));
  };

  const handleAddToCart = () => {
    if (selectedVariant && available > 0) {
      addItem(selectedVariant.id, 1);
    }
  };

  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-3">
        <p className="text-2xl font-semibold text-gray-900">{formatCurrency(price)}</p>
        {compareAt && (
          <p className="text-sm font-medium text-muted-foreground line-through">
            {formatCurrency(compareAt)}
          </p>
        )}
      </div>
      
      <p className="mt-2 text-sm font-medium text-gray-600">
        {available > 0 ? (
          <span className="text-green-700">In stock</span>
        ) : (
          <span className="text-red-600">Out of stock</span>
        )}
      </p>

      {hasOptions && (
        <div className="mt-6 space-y-5">
          {options.map((option) => (
            <div key={option.id}>
              <h3 className="text-sm font-medium text-gray-900">{option.name}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {option.values.map((val) => {
                  const isSelected = selectedValues[option.id] === val.id;
                  
                  // Check if this value exists in any variant
                  const isAvailable = variants.some(v => 
                    v.optionValues?.some(ov => ov.optionValueId === val.id)
                  );

                  return (
                    <button
                      key={val.id}
                      onClick={() => handleSelect(option.id, val.id)}
                      disabled={!isAvailable}
                      className={`min-w-[3rem] rounded-md border px-3 py-2 text-sm font-medium transition-colors
                        ${isSelected 
                          ? "border-[#D57959] bg-[#D57959] text-white" 
                          : isAvailable 
                            ? "border-gray-300 bg-white text-gray-900 hover:bg-gray-50" 
                            : "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed opacity-60"
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
        disabled={!selectedVariant || available <= 0} 
        onClick={handleAddToCart}
        className="mt-8 h-12 w-full rounded-md bg-gray-900 px-8 text-base font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
      >
        {selectedVariant && available > 0 ? "Add to cart" : "Unavailable"}
      </button>
    </div>
  );
}
