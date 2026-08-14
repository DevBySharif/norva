"use client";
import Image from "next/image";
import { useState } from "react";
import { ProductMediaFallback } from "./product-media-fallback";
import { ProductModelViewer } from "./product-model-viewer";

type GalleryImage = { id: string; url: string; altText: string | null };
export function ProductGallery({ images, productName, modelUrl }: { images: GalleryImage[]; productName: string; modelUrl?: string | null }) {
  const [selected, setSelected] = useState(0); const [showModel, setShowModel] = useState(false);
  if (!images.length && !modelUrl) return <div className="aspect-[4/3] overflow-hidden"><ProductMediaFallback name={productName}/></div>;
  if (showModel && modelUrl) return <div><ProductModelViewer src={modelUrl} productName={productName}/><button type="button" className="catalog-secondary-button mt-3" onClick={() => setShowModel(false)}>View images</button></div>;
  if (!images.length) return <div><div className="aspect-[4/3] overflow-hidden"><ProductMediaFallback name={productName}/></div><button type="button" className="catalog-primary-button mt-3" onClick={() => setShowModel(true)}>View in 3D</button></div>;
  const current = images[Math.min(selected, images.length - 1)];
  return <div className="min-w-0"><div data-testid="product-gallery-main" className="relative aspect-square overflow-hidden bg-muted"><Image priority src={current.url} alt={current.altText || productName} fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover"/></div><div className="mt-3 flex flex-wrap gap-2">{modelUrl && <button type="button" className="catalog-primary-button" onClick={() => setShowModel(true)}>View in 3D</button>}</div>{images.length > 1 && <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6" aria-label="Product image thumbnails">{images.map((image, index) => <button key={image.id} type="button" aria-label={`Show image ${index + 1} of ${images.length}`} aria-pressed={selected === index} onClick={() => setSelected(index)} className={`relative aspect-square overflow-hidden border-2 bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${selected === index ? "border-[#8b5946]" : "border-transparent"}`}><Image src={image.url} alt="" fill sizes="120px" className="object-cover"/></button>)}</div>}</div>;
}
