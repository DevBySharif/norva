import Link from "next/link";
import { ArrowRight, Circle, Diamond, Square } from "lucide-react";
import { ProductCard } from "@/components/store/product-card";
import { Button } from "@/components/ui/button";
import { getStoreProducts } from "@/features/products/queries";
import { getStoreSettings } from "@/features/store/settings";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export default async function HomePage() {
  const session = await getCurrentUser();
  const [settings, categories, catalog] = await Promise.all([
    getStoreSettings(),
    prisma.category.findMany({
      where: { isActive: true, products: { some: { status: "ACTIVE", deletedAt: null } } },
      select: { id: true, name: true, slug: true, description: true, imageUrl: true, _count: { select: { products: { where: { status: "ACTIVE", deletedAt: null } } } } },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      take: 3,
    }),
    getStoreProducts({ page: 1 }),
  ]);
  const products = catalog.products.slice(0, 3);
  const customerId = session?.user.role === "CUSTOMER" ? session.user.id : undefined;
  const savedProductIds = customerId
    ? new Set((await prisma.wishlistItem.findMany({ where: { wishlist: { userId: customerId }, productId: { in: products.map((product) => product.id) } }, select: { productId: true } })).map((item) => item.productId))
    : new Set<string>();
  const categoryIcons = [Circle, Diamond, Square];

  return <>
    <section className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:py-16">
      <div className="flex min-h-[25rem] flex-col justify-center">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-muted-foreground">The Norva collection</p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">Useful objects, chosen with care.</h1>
        <p className="mt-5 max-w-lg leading-7 text-muted-foreground">Explore the current catalog of considered essentials for daily life.</p>
        <div className="mt-8"><Button asChild size="lg"><Link href="/products">Shop all products <ArrowRight className="size-4" /></Link></Button></div>
      </div>
      <div className="relative min-h-80 overflow-hidden border border-[#c9bdad] bg-[#e5ded2] p-7 sm:min-h-[29rem] sm:p-10" aria-label="Norva editorial composition">
        <div className="absolute inset-5 border border-[#bcae9d]" aria-hidden="true" />
        <div className="relative flex h-full min-h-72 flex-col justify-between">
          <div className="flex justify-between text-[0.65rem] font-bold uppercase tracking-[.2em] text-[#6d6054]"><span>Form / function</span><span>Issue 01</span></div>
          <div className="mx-auto flex items-end gap-3 py-8" aria-hidden="true"><div className="h-28 w-20 rounded-t-full border border-[#72594a] bg-[#d57959]"/><div className="size-36 rounded-full border border-[#72594a] bg-[#f0eee6]"/><div className="h-44 w-16 border border-[#72594a] bg-[#9ca393]"/></div>
          <div><p className="max-w-xs text-2xl font-semibold leading-tight">A quieter approach to the everyday.</p><p className="mt-2 text-sm text-[#6d6054]">Material, proportion, purpose.</p></div>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
      <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-muted-foreground">Browse the catalog</p><h2 className="mt-2 text-2xl font-semibold">Shop by category</h2></div><Link href="/products" className="hidden text-sm font-semibold hover:underline sm:block">View all products</Link></div>
      {categories.length ? <div className="mt-6 grid gap-4 sm:grid-cols-3">{categories.map((category, index) => { const Icon = categoryIcons[index % categoryIcons.length]; return <Link href={`/category/${category.slug}`} key={category.id} className="group relative min-h-56 overflow-hidden border border-[#c9bdad] bg-card p-6 hover:border-[#9f8c78]">{category.imageUrl ? <div className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage: `url(${category.imageUrl})` }} /> : null}<div className="relative flex h-full flex-col"><div className="flex items-start justify-between"><span className="text-xs font-bold tracking-[.16em]">0{index + 1}</span><Icon className="size-8 text-[#d57959]" strokeWidth={1.25}/></div><div className="mt-auto"><p className="text-xs text-muted-foreground">{category._count.products} product{category._count.products === 1 ? "" : "s"}</p><h3 className="mt-2 text-xl font-semibold group-hover:underline">{category.name}</h3>{category.description && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{category.description}</p>}</div></div></Link>; })}</div> : <div className="mt-6 border border-dashed p-8 text-sm text-muted-foreground">Categories will appear here when they are published.</div>}
    </section>

    <section className="bg-card py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6"><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-muted-foreground">From the catalog</p><h2 className="mt-2 text-2xl font-semibold">{products.length ? "New arrivals" : "Collection coming together"}</h2></div><Link href="/products" className="text-sm font-semibold hover:underline">View catalog</Link></div>{products.length ? <div className="mt-7 grid grid-cols-2 gap-5 sm:grid-cols-3">{products.map((product) => <ProductCard key={product.id} product={product} currency={settings.currency} initialWishlisted={savedProductIds.has(product.id)} />)}</div> : <div className="mt-7 max-w-2xl border-l-2 border-[#d57959] py-3 pl-5"><p className="text-lg font-medium">Thoughtful products are being prepared for the shop.</p><p className="mt-2 text-sm leading-6 text-muted-foreground">The catalog is intentionally quiet for now. Check back as the first collection is published.</p></div>}</div>
    </section>

    <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6"><div className="grid gap-6 bg-primary p-8 text-primary-foreground md:grid-cols-2 md:p-12"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-primary-foreground/60">The Norva standard</p><h2 className="mt-3 text-3xl font-semibold">Fewer, better choices.</h2></div><p className="self-end leading-7 text-primary-foreground/75">A focused catalog, transparent product details, and dependable service—without the noise.</p></div></section>
  </>;
}
