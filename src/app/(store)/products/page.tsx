import Link from "next/link";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductCard } from "@/components/store/product-card";
import { getStoreProducts } from "@/features/products/queries";
import { getStoreSettings } from "@/features/store/settings";

export default async function ProductsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const value = (key: string) => typeof params[key] === "string" ? params[key] : undefined;
  const [result, settings] = await Promise.all([
    getStoreProducts({ q: value("q"), brand: value("brand"), category: value("category"), sort: value("sort"), page: Number(value("page") ?? "1") }),
    getStoreSettings(),
  ]);
  const pageHref = (page: number) => {
    const query = new URLSearchParams();
    for (const key of ["q", "brand", "category", "sort"]) if (value(key)) query.set(key, value(key)!);
    query.set("page", String(page));
    return `/products?${query}`;
  };

  return <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
    <p className="text-xs font-bold uppercase tracking-[.16em] text-muted-foreground">Catalog</p>
    <h1 className="mt-2 text-3xl font-semibold">{value("q") ? `Results for “${value("q")}”` : "All products"}</h1>
    <form className="mt-6 flex flex-wrap gap-3">
      <label className="sr-only" htmlFor="catalog-search">Search products</label>
      <input id="catalog-search" name="q" defaultValue={value("q")} placeholder="Search products" className="h-11 min-w-56 flex-1 rounded-md border bg-card px-3 text-sm sm:max-w-sm" />
      <select aria-label="Sort products" name="sort" defaultValue={value("sort")} className="h-11 rounded-md border bg-card px-3 text-sm"><option value="">Newest</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="name">Name</option></select>
      <button className="h-11 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">Search</button>
    </form>
    {result.products.length ? <><div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">{result.products.map((product) => <ProductCard key={product.id} product={product} currency={settings.currency} />)}</div>{result.pages > 1 && <nav className="mt-10 flex justify-center gap-3" aria-label="Pagination">{result.page > 1 && <Link className="rounded border px-3 py-2 text-sm" href={pageHref(result.page - 1)}>Previous</Link>}<span className="px-3 py-2 text-sm">Page {result.page} of {result.pages}</span>{result.page < result.pages && <Link className="rounded border px-3 py-2 text-sm" href={pageHref(result.page + 1)}>Next</Link>}</nav>}</> : <div className="mt-8"><EmptyState title={value("q") ? "No products found" : "No products are available right now"} description={value("q") ? "Try another product name or clear the search." : "The first collection is being prepared. Please check back soon."} /></div>}
  </section>;
}
