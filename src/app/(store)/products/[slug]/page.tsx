import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProductBySlug } from "@/features/products/queries";
import { VariantSelector } from "@/components/store/variant-selector";
import { WishlistButton } from "@/components/store/wishlist-button";
import { ReviewForm } from "@/components/store/review-form";
import { canReviewProduct, getCustomerReview, getProductReviews } from "@/features/reviews/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { isProductWishlisted } from "@/features/wishlist/queries";
import { ProductGallery } from "@/components/store/product-gallery";
import Link from "next/link";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const product = await getProductBySlug((await params).slug); if (!product) return {}; return { title: product.seoTitle ?? product.name, description: product.seoDescription ?? product.shortDescription ?? product.description ?? undefined, alternates: { canonical: `/products/${product.slug}` }, openGraph: { images: product.images[0]?.url ? [product.images[0].url] : [] } }; }
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) { 
  const product = await getProductBySlug((await params).slug); 
  if (!product) notFound(); 
  const session = await getCurrentUser(); 
  const customerId = session?.user.role === "CUSTOMER" ? session.user.id : undefined; 
  const [reviewData, ownReview, eligible, isWishlisted] = await Promise.all([
    getProductReviews(product.id), 
    getCustomerReview(product.id, customerId), 
    canReviewProduct(product.id, customerId), 
    isProductWishlisted(customerId, product.id)
  ]);
  
  return (
    <section className="store-container py-10 sm:py-16">
      <div className="grid items-start gap-12 lg:grid-cols-2 lg:gap-16 xl:gap-24">
        {/* Left Column: Media */}
        <div className="min-w-0 w-full max-w-[600px] mx-auto lg:mx-0 lg:max-w-none">
          <ProductGallery images={product.images} productName={product.name} modelUrl={product.model3d?.publicUrl} />
        </div>
        
        {/* Right Column: Info */}
        <div className="min-w-0 flex flex-col pt-2 lg:pt-6">
          <nav aria-label="Breadcrumb" className="mb-6">
            <ol className="flex items-center text-xs font-semibold uppercase tracking-widest text-[#8b5946]">
              <li><Link href="/products" className="hover:text-[#2c2825] transition-colors">Catalog</Link></li>
              <li className="mx-2 text-[#c9bdad]">•</li>
              <li><Link href={`/category/${product.category.slug}`} className="hover:text-[#2c2825] transition-colors">{product.category.name}</Link></li>
              {product.brand && (
                <>
                  <li className="mx-2 text-[#c9bdad]">•</li>
                  <li className="text-muted-foreground">{product.brand.name}</li>
                </>
              )}
            </ol>
          </nav>
          
          <h1 className="text-3xl font-medium tracking-tight text-[#2c2825] sm:text-4xl lg:text-[2.5rem] leading-[1.1]">{product.name}</h1>
          
          <div className="mt-8 border-y border-[#d8d0c3]/60 py-6">
            <VariantSelector 
              basePrice={Number(product.basePrice)} 
              compareAtPrice={product.compareAtPrice ? Number(product.compareAtPrice) : null}
              options={product.options} 
              variants={product.variants.map(v => ({
                ...v,
                price: v.price ? Number(v.price) : null,
                salePrice: v.salePrice ? Number(v.salePrice) : null,
              }))} 
            />
            
            <div className="mt-6 max-w-xs">
              <WishlistButton productId={product.id} initialSaved={isWishlisted} />
            </div>
          </div>
          
          <div className="mt-8 prose prose-sm max-w-none text-[#6d6054] leading-relaxed">
            <p>{product.description}</p>
          </div>
          
          {/* Reviews Summary Hook */}
          {reviewData.count > 0 && (
            <div className="mt-8 pt-6 border-t border-[#d8d0c3]/60 flex items-center text-sm font-medium text-[#2c2825]">
              <span className="text-[#d57959] mr-1.5" aria-hidden="true">★</span>
              {reviewData.average?.toFixed(1)} <span className="mx-1.5 text-muted-foreground">·</span> 
              <a href="#reviews-heading" className="underline decoration-[#d8d0c3] underline-offset-4 hover:decoration-[#8b5946] transition-colors">{reviewData.count} reviews</a>
            </div>
          )}
        </div>
      </div>
      
      {/* Reviews Section */}
      <section className="mt-20 lg:mt-32 max-w-3xl border-t border-[#d8d0c3] pt-12" aria-labelledby="reviews-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="reviews-heading" className="text-2xl font-medium tracking-tight text-[#2c2825]">Customer reviews</h2>
          <p className="text-sm font-medium text-[#8b5946]">
            {reviewData.count ? (
              <span className="flex items-center gap-1.5"><span className="text-[#d57959]">★</span> {reviewData.average?.toFixed(1)} from {reviewData.count} review{reviewData.count === 1 ? "" : "s"}</span>
            ) : "No reviews yet"}
          </p>
        </div>
        
        <div className="mt-8">
          {eligible ? (
            <div className="bg-[#f9f8f6] border border-[#d8d0c3]/60 p-6 sm:p-8">
              <ReviewForm productId={product.id} review={ownReview}/>
            </div>
          ) : (
            <div className="bg-[#f9f8f6] border-l-2 border-[#d57959] p-5">
              <p className="text-sm font-medium text-[#6d6054]">
                {customerId ? "A delivered purchase is required before you can review this product." : "Sign in after receiving your order to write a verified review."}
              </p>
            </div>
          )}
        </div>
        
        {reviewData.reviews.length > 0 && (
          <div className="mt-10 space-y-8">
            {reviewData.reviews.map((review) => (
              <article className="min-w-0 border-b border-[#d8d0c3]/60 pb-8 last:border-0" key={review.id}>
                <div className="flex flex-wrap justify-between gap-2 items-center">
                  <div>
                    <p className="font-medium text-[#2c2825]">{review.user.name?.trim() || "Verified customer"}</p>
                    <p className="mt-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-[#d57959]">Verified Purchase</p>
                  </div>
                  <time className="text-xs text-muted-foreground" dateTime={review.createdAt.toISOString()}>{review.createdAt.toLocaleDateString()}</time>
                </div>
                <div className="mt-4 flex" aria-label={`${review.rating} out of 5 stars`}>
                  {[...Array(5)].map((_, i) => (
                    <span key={i} className={`text-sm ${i < review.rating ? "text-[#d57959]" : "text-[#d8d0c3]"}`}>★</span>
                  ))}
                </div>
                {review.title && <h3 className="mt-3 text-[0.9375rem] font-semibold text-[#2c2825]">{review.title}</h3>}
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-[#6d6054] whitespace-pre-wrap break-words">{review.body}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
