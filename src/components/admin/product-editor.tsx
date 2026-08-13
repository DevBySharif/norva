"use client";
import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createProduct, updateProduct } from "@/features/products/actions";
import { OptionInput, generateCombinations } from "@/features/products/variant-combinations";
import { OptionsBuilder } from "./options-builder";
import { VariantMatrix, VariantRow } from "./variant-matrix";
import { ProductMediaManager, ManagedImage } from "./product-media-manager";

type EditorProduct = { id: string; name: string; slug: string; shortDescription: string | null; description: string | null; status: string; categoryId: string; brandId: string | null; seoTitle: string | null; seoDescription: string | null; sku: string; basePrice: unknown; options?: { id: string; name: string; values: { id: string; value: string; }[] }[]; variants: { id: string; combinationKey: string | null; sku: string; price: unknown; salePrice: unknown; costPrice: unknown; inventory: { quantity: number; reorderPoint: number | null } | null; optionValues: { optionValueId: string; optionValue: { value: string } }[] }[]; images: ManagedImage[] };
type Props = { product?: EditorProduct; categories: { id: string; label: string }[]; brands: { id: string; name: string }[] };

const value = (v: unknown) => v == null ? "" : String(v);
const num = (v: unknown) => v == null ? 0 : Number(v);

export function ProductEditor({ product, categories, brands }: Props) {
  const router = useRouter(); 
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");

  const initialOptions = product?.options?.map(o => ({
    id: o.id, name: o.name, values: o.values.map(v => ({ id: v.id, value: v.value }))
  })) || [];

  const initialVariants = product?.variants?.map(v => ({
    id: v.id,
    combinationKey: v.combinationKey,
    valueIds: v.optionValues?.map(ov => ov.optionValueId) || [],
    label: v.optionValues?.map(ov => ov.optionValue.value).join(" / ") || "",
    sku: v.sku,
    price: value(v.price),
    salePrice: value(v.salePrice) || null,
    costPrice: value(v.costPrice) || null,
    quantity: num(v.inventory?.quantity),
    lowStockThreshold: num(v.inventory?.reorderPoint)
  })) || [
    { combinationKey: null, valueIds: [], label: "", sku: product?.sku || "", price: value(product?.basePrice || ""), salePrice: null, costPrice: null, quantity: 0, lowStockThreshold: 0 }
  ];

  const [options, setOptions] = useState<OptionInput[]>(initialOptions);
  const [variants, setVariants] = useState<VariantRow[]>(initialVariants);
  const [baseSku, setBaseSku] = useState(product?.sku || initialVariants[0]?.sku || "");
  const [basePrice, setBasePrice] = useState(product?.basePrice ? Number(product.basePrice).toString() : initialVariants[0]?.price ? Number(initialVariants[0].price).toString() : "");
  const [baseQuantity, setBaseQuantity] = useState(initialVariants[0]?.quantity || 0);

  useEffect(() => {
    if (options.length === 0 && variants.length === 1 && !variants[0].combinationKey) {
      setBaseSku(variants[0].sku);
      setBasePrice(variants[0].price != null ? Number(variants[0].price).toString() : "");
      setBaseQuantity(variants[0].quantity);
    }
  }, [options.length, variants]);

  useEffect(() => {
    setVariants(prev => {
      if (options.length === 0) {
        if (prev.length !== 1 || prev[0].combinationKey !== null) {
           return [prev[0] ? { ...prev[0], combinationKey: null, valueIds: [], label: "" } : { combinationKey: null, valueIds: [], label: "", sku: baseSku, price: basePrice, salePrice: null, costPrice: null, quantity: 0, lowStockThreshold: 0 }];
        }
        return prev;
      }

      try {
        const combinations = generateCombinations(options);
        setMessage(""); // Clear any previous combination errors
        
        const effectiveBaseSku = baseSku || (prev.length > 0 && !prev[0].combinationKey ? prev[0].sku : "");
        const effectiveBasePrice = basePrice || (prev.length > 0 && !prev[0].combinationKey ? (prev[0].price != null ? Number(prev[0].price).toString() : "") : "");
        const effectiveBaseQuantity = baseQuantity;

        return combinations.map(comb => {
          const existing = prev.find(v => v.combinationKey === comb.key);
          if (existing) return { ...existing, label: comb.label, valueIds: comb.valueIds };
          
          const suggestedSku = effectiveBaseSku ? `${effectiveBaseSku}-${comb.label.replace(/[\s\/]+/g, '-').toUpperCase()}` : "";
          
          return {
            combinationKey: comb.key,
            valueIds: comb.valueIds,
            label: comb.label,
            sku: suggestedSku,
            price: effectiveBasePrice,
            salePrice: null,
            costPrice: null,
            quantity: effectiveBaseQuantity,
            lowStockThreshold: 0
          };
        });
      } catch (err: unknown) {
        if (err instanceof Error) setMessage(err.message);
        return prev;
      }
    });
  }, [options, baseSku, basePrice, baseQuantity]);

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const input = Object.fromEntries(form);
    
    // Construct structured payload
    const payload = {
      ...input,
      options,
      variants,
    };

    start(async () => {
      const result = product ? await updateProduct(product.id, payload) : await createProduct(payload);
      setMessage(result.message);
      if (result.success) router.push(`/admin/products/${result.id ?? product?.id}`);
    });
  };

  const field = "catalog-field mt-1 w-full";

  return <form onSubmit={submit} className="space-y-6"><p role="status" aria-live="polite" className="text-sm text-[#8b5946]">{message}</p>
    <Section title="General">
      <Grid><Label label="Name"><input required name="name" defaultValue={product?.name} className={field}/></Label><Label label="Slug"><input required name="slug" defaultValue={product?.slug} className={field}/></Label></Grid>
      <Label label="Short description"><input name="shortDescription" defaultValue={product?.shortDescription ?? undefined} className={field}/></Label>
      <Label label="Description"><textarea name="description" defaultValue={product?.description ?? undefined} className={field} rows={5}/></Label>
      <Label label="Status"><select name="status" defaultValue={product?.status ?? "DRAFT"} className={field}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="ARCHIVED">Archived</option></select></Label>
    </Section>
    <Section title="Organization">
      <Grid><Label label="Category"><select required name="categoryId" defaultValue={product?.categoryId} className={field}><option value="">Select a category</option>{categories.map(x => <option value={x.id} key={x.id}>{x.label}</option>)}</select></Label><Label label="Brand"><select required name="brandId" defaultValue={product?.brandId ?? undefined} className={field}><option value="">Select a brand</option>{brands.map(x => <option value={x.id} key={x.id}>{x.name}</option>)}</select></Label></Grid>
    </Section>
    <Section title="Media">
      <ProductMediaManager productId={product?.id} productName={product?.name || "Product"} images={product?.images || []}/>
      {!product && <details open className="text-sm"><summary className="cursor-pointer font-medium">Advanced: start with an existing public image URL</summary><Grid><Label label="Image URL"><input type="url" name="imageUrl" className={field}/></Label><Label label="Image alt text"><input name="imageAlt" className={field}/></Label></Grid></details>}
    </Section>
    
    <Section title="Options & Variants">
       {options.length > 0 && (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 bg-[#F0EEE6]/50 p-4 rounded-lg border border-[#d8d0c3]/50">
             <Label label="Base SKU (used for suggestions)"><input type="text" value={baseSku} onChange={e => setBaseSku(e.target.value)} className={field} /></Label>
             <Label label="Base Price (used for suggestions)"><input type="number" step="0.01" min="0" value={basePrice} onChange={e => setBasePrice(e.target.value)} className={field} /></Label>
          </div>
       )}
       <div className="mb-6">
          <OptionsBuilder options={options} onChange={setOptions} />
       </div>
       <VariantMatrix variants={variants} onChange={setVariants} />
    </Section>

    <Section title="SEO">
      <Label label="SEO title"><input name="seoTitle" defaultValue={product?.seoTitle ?? undefined} className={field}/></Label><Label label="SEO description"><textarea name="seoDescription" defaultValue={product?.seoDescription ?? undefined} className={field} rows={3}/></Label>
    </Section>
    <div className="flex gap-3"><button disabled={pending} className="catalog-primary-button" type="submit">{pending ? "Saving…" : product ? "Save product" : "Create product"}</button><button type="button" className="catalog-secondary-button" onClick={() => router.push("/admin/products")}>Cancel</button></div>
  </form>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-xl border border-[#d8d0c3] bg-white/70 p-5 shadow-sm"><h2 className="text-lg font-semibold">{title}</h2><div className="mt-4 space-y-4">{children}</div></section>; }
function Grid({ children }: { children: React.ReactNode }) { return <div className="grid gap-4 sm:grid-cols-2">{children}</div>; }
function Label({ label, children }: { label: string; children: React.ReactNode }) { return <label className="catalog-label block">{label}{children}</label>; }
