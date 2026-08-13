"use client";
import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Star, Trash2, Upload } from "lucide-react";
import { moveProductImage, removeProductImage, updateProductImageAlt } from "@/features/products/media-actions";
import { PRODUCT_IMAGE_LIMIT } from "@/features/media/config";

export type ManagedImage = { id: string; url: string; altText: string | null; position: number; isPrimary: boolean };

export function ProductMediaManager({ productId, productName, images }: { productId?: string; productName: string; images: ManagedImage[] }) {
  const router = useRouter(); const input = useRef<HTMLInputElement>(null); const [busy, start] = useTransition(); const [uploading, setUploading] = useState(false); const [message, setMessage] = useState("");
  const run = (action: () => Promise<{ success: boolean; message: string }>) => start(async () => { const result = await action(); setMessage(result.message); if (result.success) router.refresh(); });
  const upload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file || !productId) return;
    if (uploading) return; setUploading(true); setMessage("Uploading image…");
    const body = new FormData(); body.set("image", file); body.set("altText", productName);
    const response = await fetch(`/api/admin/products/${productId}/media`, { method: "POST", body });
    const result = await response.json() as { message?: string };
    setMessage(response.ok ? "Image uploaded." : result.message || "Unable to upload image.");
    if (input.current) input.current.value = ""; setUploading(false);
    if (response.ok) router.refresh();
  };
  if (!productId) return <div className="rounded-lg border border-dashed border-[#b8aa98] p-5 text-sm text-muted-foreground">Create the product first, then add up to {PRODUCT_IMAGE_LIMIT} photographs from its edit page. Photography is optional.</div>;
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-3"><label className="catalog-primary-button cursor-pointer"><Upload className="mr-2 inline size-4"/>{uploading ? "Uploading…" : "Upload image"}<input ref={input} className="sr-only" aria-label="Upload product image" type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || uploading || images.length >= PRODUCT_IMAGE_LIMIT} onChange={upload}/></label><span className="text-sm text-muted-foreground">JPEG, PNG, or WebP · 8 MB max · {images.length}/{PRODUCT_IMAGE_LIMIT}</span></div>
    <p role={message ? "status" : undefined} aria-live="polite" className="min-h-5 text-sm text-[#8b5946]">{message}</p>
    {images.length === 0 ? <div className="rounded-lg bg-[#f3eee6] p-4 text-sm"><strong>No product image.</strong> The storefront will use its intentional fallback.</div> : <ol className="grid gap-4 sm:grid-cols-2">{images.map((image, index) => <li key={image.id} className="rounded-lg border bg-white p-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-[#e7e1d6]"><Image src={image.url} alt={image.altText || productName} fill sizes="(max-width: 640px) 100vw, 360px" className="object-cover"/>{image.isPrimary && <span className="absolute left-2 top-2 rounded bg-black/75 px-2 py-1 text-xs font-semibold text-white">Primary</span>}</div>
      <label className="catalog-label mt-3 block">Alt text<input className="catalog-field mt-1 w-full" defaultValue={image.altText || ""} maxLength={300} onBlur={(event) => run(() => updateProductImageAlt(productId, image.id, event.currentTarget.value))}/></label>
      <div className="mt-3 flex flex-wrap gap-2">
        {!image.isPrimary && <button disabled={busy} type="button" className="catalog-secondary-button" aria-label={`Set image ${index + 1} as primary`} onClick={() => run(() => moveProductImage(productId, image.id, "primary"))}><Star className="size-4"/> Primary</button>}
        <button disabled={busy || index === 0} type="button" className="catalog-secondary-button" aria-label={`Move image ${index + 1} left`} onClick={() => run(() => moveProductImage(productId, image.id, "up"))}><ArrowLeft className="size-4"/></button>
        <button disabled={busy || index === images.length - 1} type="button" className="catalog-secondary-button" aria-label={`Move image ${index + 1} right`} onClick={() => run(() => moveProductImage(productId, image.id, "down"))}><ArrowRight className="size-4"/></button>
        <button disabled={busy} type="button" className="catalog-secondary-button text-red-700" aria-label={`Remove image ${index + 1}`} onClick={() => run(() => removeProductImage(productId, image.id))}><Trash2 className="size-4"/> Remove</button>
      </div>
    </li>)}</ol>}
  </div>;
}
