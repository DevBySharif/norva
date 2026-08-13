import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductCard } from "@/components/store/product-card";
import { getCategoryBySlug } from "@/features/categories/queries";
import { getStoreProducts } from "@/features/products/queries";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const category = await getCategoryBySlug((await params).slug);
  return category ? { title: category.seoTitle ?? category.name, description: category.seoDescription ?? category.description ?? undefined, alternates: { canonical: `/category/${category.slug}` } } : {};
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const category = await getCategoryBySlug((await params).slug);
  if (!category) notFound();
  const { products } = await getStoreProducts({ category: category.slug });
  return <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
    <h1 className="text-3xl font-semibold">{category.name}</h1>
    {category.description && <p className="mt-3 max-w-xl text-muted-foreground">{category.description}</p>}
    {category.children.length > 0 && <div className="mt-6 flex flex-wrap gap-3">{category.children.map((child) => <Link className="rounded border px-3 py-2 text-sm hover:bg-card" href={`/category/${child.slug}`} key={child.id}>{child.name}</Link>)}</div>}
    {products.length ? <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">{products.map((product) => <ProductCard key={product.id} product={product}/>)}</div> : <div className="mt-8"><EmptyState title="No products in this category" description="Products will appear here when this category is stocked."/></div>}
  </section>;
}
