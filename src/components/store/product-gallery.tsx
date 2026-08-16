"use client";
import Image from "next/image";
import { useState } from "react";
import { ProductMediaFallback } from "./product-media-fallback";
import { ProductModelViewer } from "./product-model-viewer";

type GalleryImage = { id: string; url: string; altText: string | null };
export function ProductGallery({ images, productName, modelUrl }: { images: GalleryImage[]; productName: string; modelUrl?: string | null }) {
  const [selected, setSelected] = useState(0); 
  const [showModel, setShowModel] = useState(false);
  
  if (!images.length && !modelUrl) {
    return <div className="aspect-square overflow-hidden border border-[#d8d0c3]/60 bg-[#f9f8f6]"><ProductMediaFallback name={productName}/></div>;
  }
  
  const current = images.length > 0 ? images[Math.min(selected, images.length - 1)] : null;
  
  return (
    <div className="min-w-0 flex flex-col gap-4">
      {/* Main Viewport */}
      <div data-testid="product-gallery-main" className="relative aspect-[4/5] sm:aspect-square overflow-hidden border border-[#d8d0c3]/60 bg-[#f9f8f6] shadow-sm">
        {showModel && modelUrl ? (
          <div className="absolute inset-0">
            <ProductModelViewer src={modelUrl} productName={productName} />
          </div>
        ) : current ? (
          <Image priority src={current.url} alt={current.altText || productName} fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover mix-blend-multiply" />
        ) : (
          <ProductMediaFallback name={productName}/>
        )}
      </div>

      {/* Controls & Thumbnails */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {images.length > 1 && !showModel && (
          <div className="flex flex-wrap gap-3 flex-1" aria-label="Product image thumbnails">
            {images.map((image, index) => (
              <button 
                key={image.id} 
                type="button" 
                aria-label={`Show image ${index + 1} of ${images.length}`} 
                aria-pressed={selected === index} 
                onClick={() => setSelected(index)} 
                className={`relative size-16 sm:size-20 overflow-hidden border-2 bg-muted transition-all duration-200 focus-visible:outline-none ${selected === index ? "border-[#8b5946] ring-1 ring-[#8b5946] ring-offset-1" : "border-transparent opacity-70 hover:opacity-100"}`}
              >
                <Image src={image.url} alt="" fill sizes="80px" className="object-cover mix-blend-multiply" />
              </button>
            ))}
          </div>
        )}
        
        {modelUrl && (
          <div className="ml-auto flex items-center">
            {showModel ? (
              <button type="button" className="store-secondary-button text-sm px-5 py-2.5 shadow-sm" onClick={() => setShowModel(false)}>
                Back to images
              </button>
            ) : (
              <button type="button" className="store-primary-button text-sm px-6 py-2.5 shadow-sm" onClick={() => setShowModel(true)}>
                View in 3D
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
