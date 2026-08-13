import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProductBySlug } from "@/features/products/queries";
import { VariantSelector } from "@/components/store/variant-selector";
import { WishlistButton } from "@/components/store/wishlist-button";
import { ReviewForm } from "@/components/store/review-form";
import { canReviewProduct, getCustomerReview, getProductReviews } from "@/features/reviews/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { isProductWishlisted } from "@/features/wishlist/queries";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const product = await getProductBySlug((await params).slug); if (!product) return {}; return { title: product.seoTitle ?? product.name, description: product.seoDescription ?? product.shortDescription ?? product.description ?? undefined, alternates: { canonical: `/products/${product.slug}` }, openGraph: { images: product.images[0]?.url ? [product.images[0].url] : [] } }; }
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) { 
  const product = await getProductBySlug((await params).slug); 
  if (!product) notFound(); const session = await getCurrentUser(); const customerId = session?.user.role === "CUSTOMER" ? session.user.id : undefined; const [reviewData, ownReview, eligible, isWishlisted] = await Promise.all([getProductReviews(product.id), getCustomerReview(product.id, customerId), canReviewProduct(product.id, customerId), isProductWishlisted(customerId, product.id)]);
  return <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6"><p className="text-sm text-muted-foreground">{product.category.name}{product.brand ? ` / ${product.brand.name}` : ""}</p><div className="mt-5 grid gap-8 lg:grid-cols-2"><div className="grid grid-cols-2 gap-3">{product.images.length ? product.images.map((image) => <div className="relative aspect-square bg-muted" key={image.id}><Image className="object-cover" src={image.url} alt={image.altText ?? product.name} fill sizes="(max-width: 1024px) 50vw, 25vw"/></div>) : <div className="aspect-square bg-muted"/>}</div><div><h1 className="text-3xl font-semibold">{product.name}</h1>
  <VariantSelector 
    basePrice={Number(product.basePrice)} 
    options={product.options} 
    variants={product.variants.map(v => ({
      ...v,
      price: v.price ? Number(v.price) : null,
      salePrice: v.salePrice ? Number(v.salePrice) : null,
    }))} 
  />
  <div className="mt-4"><WishlistButton productId={product.id} initialSaved={isWishlisted}/></div>
  <div className="mt-8 border-t pt-6 text-sm leading-7 text-muted-foreground">{product.description}</div></div></div><section className="mt-12 max-w-3xl border-t pt-8" aria-labelledby="reviews-heading"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="reviews-heading" className="text-2xl font-semibold">Reviews</h2><p className="text-sm text-muted-foreground">{reviewData.count ? `${reviewData.average?.toFixed(1)} ★ · ${reviewData.count} review${reviewData.count === 1 ? "" : "s"}` : "No reviews yet"}</p></div>{eligible && <ReviewForm productId={product.id} review={ownReview}/>}<div className="mt-6 space-y-5">{reviewData.reviews.map((review) => <article className="min-w-0 rounded-lg border bg-card p-4" key={review.id}><div className="flex flex-wrap justify-between gap-2"><p className="font-medium">{review.user.name?.trim() || "Verified customer"}</p><p aria-label={`${review.rating} out of 5 stars`}>{"★".repeat(review.rating)}<span className="text-muted-foreground">{"☆".repeat(5 - review.rating)}</span></p></div><p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#b45d43]">Verified Purchase</p>{review.title && <h3 className="mt-3 break-words font-medium">{review.title}</h3>}<p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{review.body}</p><time className="mt-3 block text-xs text-muted-foreground" dateTime={review.createdAt.toISOString()}>{review.createdAt.toLocaleDateString()}</time></article>)}</div></section></section>; 
}
