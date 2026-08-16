import Image from "next/image";
import Link from "next/link";
import { ProductMediaFallback } from "@/components/store/product-media-fallback";
import { WishlistButton } from "@/components/store/wishlist-button";
import { formatCurrency } from "@/lib/utils";

type CardProduct = {
  id: string;
  name: string;
  slug: string;
  basePrice: { toString(): string };
  compareAtPrice: { toString(): string } | null;
  brand: { name: string; slug: string } | null;
  images: Array<{ url: string; altText: string | null }>;
  variants: Array<{ price: { toString(): string } | null; salePrice: { toString(): string } | null; inventory: { quantity: number; reservedQuantity: number } | null }>;
  reviews?: Array<{ rating: number }>;
};

export function ProductCard({ product, initialWishlisted = false, currency = "USD" }: { product: CardProduct; initialWishlisted?: boolean; currency?: string }) {
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  if (product.variants.length > 0) {
    product.variants.forEach((variant) => {
      const price = Number(variant.salePrice ?? variant.price);
      if (price < minPrice) minPrice = price;
      if (price > maxPrice) maxPrice = price;
    });
  } else {
    minPrice = maxPrice = Number(product.compareAtPrice ?? product.basePrice);
  }

  const isRange = minPrice !== maxPrice && minPrice !== Infinity;
  const priceDisplay = isRange
    ? `${formatCurrency(minPrice, currency)} – ${formatCurrency(maxPrice, currency)}`
    : formatCurrency(minPrice !== Infinity ? minPrice : Number(product.basePrice), currency);
  const image = product.images[0];
  const rating = product.reviews?.length
    ? product.reviews.reduce((sum, review) => sum + review.rating, 0) / product.reviews.length
    : null;

  return (
    <article className="group flex flex-col h-full">
      <div className="relative overflow-hidden bg-[#f9f8f6] border border-[#d8d0c3]/60 transition-colors duration-300 group-hover:border-[#a58d79]">
        <Link href={`/products/${product.slug}`} className="block focus-visible:outline-none" aria-label={`View ${product.name}`}>
          <div className="relative aspect-[4/5] overflow-hidden">
            {image ? (
              <Image src={image.url} alt={image.altText ?? product.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition-transform duration-500 ease-out group-hover:scale-105 mix-blend-multiply" />
            ) : (
              <ProductMediaFallback name={product.name} />
            )}
          </div>
        </Link>
        <div className="absolute right-3 top-3 opacity-0 transition-opacity duration-300 group-hover:opacity-100 focus-within:opacity-100 sm:opacity-100">
          <div className="bg-white/80 backdrop-blur-md rounded-full shadow-sm hover:bg-white hover:shadow-md transition-all">
            <WishlistButton productId={product.id} initialSaved={initialWishlisted} compact />
          </div>
        </div>
      </div>
      <div className="pt-4 flex flex-col flex-grow">
        <p className="text-[0.6875rem] font-bold uppercase tracking-widest text-[#8b5946] mb-1">{product.brand?.name ?? "Norva selection"}</p>
        <h2 className="text-lg font-medium leading-tight text-[#2c2825] transition-colors duration-200 group-hover:text-[#d57959]">
          <Link href={`/products/${product.slug}`} className="line-clamp-2">{product.name}</Link>
        </h2>
        <div className="mt-auto pt-3 flex items-center justify-between">
          <p className="text-[0.9375rem] font-medium text-[#3b3530]">
            {priceDisplay}
            {!isRange && product.compareAtPrice ? <span className="ml-2 font-normal text-muted-foreground line-through text-sm">{formatCurrency(Number(product.compareAtPrice), currency)}</span> : null}
          </p>
          {rating !== null && <p className="text-xs text-muted-foreground" aria-label={`${rating.toFixed(1)} out of 5 stars from ${product.reviews?.length} reviews`}>★ {rating.toFixed(1)} <span className="opacity-50 mx-0.5">·</span> {product.reviews?.length}</p>}
        </div>
      </div>
    </article>
  );
}