import Image from "next/image";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";
import { WishlistButton } from "@/components/store/wishlist-button";
type CardProduct = { id: string; name: string; slug: string; basePrice: { toString(): string }; compareAtPrice: { toString(): string } | null; brand: { name: string; slug: string } | null; images: Array<{ url: string; altText: string | null }>; variants: Array<{ price: { toString(): string } | null; salePrice: { toString(): string } | null; inventory: { quantity: number; reservedQuantity: number } | null }> };
export function ProductCard({ product, initialWishlisted = false }: { product: CardProduct; initialWishlisted?: boolean }) { 
  let minPrice = Infinity; let maxPrice = -Infinity;
  if (product.variants.length > 0) {
    product.variants.forEach(v => { const p = Number(v.salePrice ?? v.price); if (p < minPrice) minPrice = p; if (p > maxPrice) maxPrice = p; });
  } else { minPrice = maxPrice = Number(product.compareAtPrice ?? product.basePrice); }
  const isRange = minPrice !== maxPrice && minPrice !== Infinity;
  const priceDisplay = isRange ? `${formatCurrency(minPrice)} – ${formatCurrency(maxPrice)}` : formatCurrency(minPrice !== Infinity ? minPrice : Number(product.basePrice));
  const image = product.images[0]; 
  return <div><Link href={`/products/${product.slug}`} className="group block"><div className="relative aspect-[4/5] overflow-hidden bg-muted">{image ? <Image src={image.url} alt={image.altText ?? product.name} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-cover transition-transform duration-300 group-hover:scale-105" /> : <div className="size-full bg-[#ddd5c8]" />}</div><div className="pt-3"><p className="text-xs text-muted-foreground">{product.brand?.name}</p><h2 className="mt-1 font-medium">{product.name}</h2><p className="mt-1 text-sm">{priceDisplay} {!isRange && product.compareAtPrice && <span className="ml-1 text-muted-foreground line-through">{formatCurrency(Number(product.compareAtPrice))}</span>}</p></div></Link><div className="mt-3"><WishlistButton productId={product.id} initialSaved={initialWishlisted}/></div></div>; 
}
