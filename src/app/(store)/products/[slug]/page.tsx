import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProductBySlug } from "@/features/products/queries";
import { VariantSelector } from "@/components/store/variant-selector";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const product = await getProductBySlug((await params).slug); if (!product) return {}; return { title: product.seoTitle ?? product.name, description: product.seoDescription ?? product.shortDescription ?? product.description ?? undefined, alternates: { canonical: `/products/${product.slug}` }, openGraph: { images: product.images[0]?.url ? [product.images[0].url] : [] } }; }
export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) { 
  const product = await getProductBySlug((await params).slug); 
  if (!product) notFound(); 
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
  <div className="mt-8 border-t pt-6 text-sm leading-7 text-muted-foreground">{product.description}</div></div></div></section>; 
}
