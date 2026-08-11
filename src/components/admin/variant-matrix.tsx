"use client";

export type VariantRow = {
  id?: string;
  combinationKey: string | null;
  valueIds: string[];
  label: string;
  sku: string;
  price: string;
  salePrice: string | null;
  costPrice: string | null;
  quantity: number;
  lowStockThreshold: number;
};

type Props = {
  variants: VariantRow[];
  onChange: (variants: VariantRow[]) => void;
};

export function VariantMatrix({ variants, onChange }: Props) {
  if (variants.length === 0) return null;

  const updateVariant = (index: number, field: keyof VariantRow, value: string | number | null) => {
    const newVariants = [...variants];
    newVariants[index] = { ...newVariants[index], [field]: value };
    onChange(newVariants);
  };

  const fieldClass = "catalog-field text-sm w-full py-1";

  return (
    <div className="overflow-auto max-h-[600px] w-full rounded-lg border border-[#d8d0c3] bg-white/50 shadow-sm">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-[#F0EEE6] font-semibold text-[#8b5946] shadow-[0_1px_0_0_#d8d0c3]">
          <tr>
            <th className="px-3 py-2 min-w-[120px]">Variant</th>
            <th className="px-3 py-2 min-w-[120px]">SKU <span className="text-red-500">*</span></th>
            <th className="px-3 py-2 w-28">Price <span className="text-red-500">*</span></th>
            <th className="px-3 py-2 w-28">Sale</th>
            <th className="px-3 py-2 w-28">Cost</th>
            <th className="px-3 py-2 w-24">Qty <span className="text-red-500">*</span></th>
            <th className="px-3 py-2 w-24">Low Qty <span className="text-red-500">*</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#d8d0c3]">
          {variants.map((variant, index) => (
            <tr key={variant.combinationKey || index}>
              <td className="px-3 py-2 align-top pt-3 font-medium text-gray-700">
                {variant.label || "Default"}
              </td>
              <td className="px-3 py-2 align-top">
                <input aria-label={variant.label ? `SKU for ${variant.label}` : "SKU"} required value={variant.sku} onChange={e => updateVariant(index, 'sku', e.target.value)} className={fieldClass} />
              </td>
              <td className="px-3 py-2 align-top">
                <input aria-label={variant.label ? `Price for ${variant.label}` : "Regular price"} required type="number" min="0" step="0.01" value={variant.price as string | number} onChange={e => updateVariant(index, 'price', e.target.value)} className={fieldClass} />
              </td>
              <td className="px-3 py-2 align-top">
                <input aria-label={variant.label ? `Sale price for ${variant.label}` : "Sale price"} type="number" min="0" step="0.01" value={variant.salePrice as string | number ?? ""} onChange={e => updateVariant(index, 'salePrice', e.target.value || null)} className={fieldClass} />
              </td>
              <td className="px-3 py-2 align-top">
                <input aria-label={variant.label ? `Cost price for ${variant.label}` : "Cost price (admin only)"} type="number" min="0" step="0.01" value={variant.costPrice as string | number ?? ""} onChange={e => updateVariant(index, 'costPrice', e.target.value || null)} className={fieldClass} />
              </td>
              <td className="px-3 py-2 align-top">
                <input aria-label={variant.label ? `Quantity for ${variant.label}` : "Quantity"} required type="number" min="0" step="1" value={variant.quantity} onChange={e => updateVariant(index, 'quantity', parseInt(e.target.value) || 0)} className={fieldClass} />
              </td>
              <td className="px-3 py-2 align-top">
                <input aria-label={variant.label ? `Low-stock threshold for ${variant.label}` : "Low-stock threshold"} required type="number" min="0" step="1" value={variant.lowStockThreshold} onChange={e => updateVariant(index, 'lowStockThreshold', parseInt(e.target.value) || 0)} className={fieldClass} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
