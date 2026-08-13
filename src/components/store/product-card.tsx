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
    <article>
      <Link href={`/products/${product.slug}`} className="group block">
        <div className="relative aspect-[4/5] overflow-hidden bg-muted">
          {image ? (
            <Image src={image.url} alt={image.altText ?? product.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition-transform duration-300 group-hover:scale-105" />
          ) : (
            <ProductMediaFallback name={product.name} />
          )}
        </div>
        <div className="pt-3">
          <p className="min-h-4 text-xs text-muted-foreground">{product.brand?.name ?? "Norva selection"}</p>
          <h2 className="mt-1 font-medium group-hover:underline">{product.name}</h2>
          <p className="mt-1 text-sm">
            {priceDisplay}
            {!isRange && product.compareAtPrice && <span className="ml-1 text-muted-foreground line-through">{formatCurrency(Number(product.compareAtPrice), currency)}</span>}
          </p>
          {rating !== null && <p className="mt-1 text-xs text-muted-foreground" aria-label={`${rating.toFixed(1)} out of 5 stars from ${product.reviews?.length} reviews`}>★ {rating.toFixed(1)} · {product.reviews?.length}</p>}
        </div>
      </Link>
      <div className="mt-3"><WishlistButton productId={product.id} initialSaved={initialWishlisted} /></div>
    </article>
  );
}
