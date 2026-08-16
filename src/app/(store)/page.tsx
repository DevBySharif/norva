import Link from "next/link";
import { Fragment } from "react";
import { ArrowRight, ArrowUpRight, Circle, Diamond, Square } from "lucide-react";
import { ProductCard } from "@/components/store/product-card";
import { getStoreProducts } from "@/features/products/queries";
import { getStoreSettings } from "@/features/store/settings";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatCurrency } from "@/lib/utils";
export default async function HomePage() {
  const session = await getCurrentUser();
  const [settings, categories, catalog] = await Promise.all([
    getStoreSettings(),
    prisma.category.findMany({
      where: { isActive: true, products: { some: { status: "ACTIVE", deletedAt: null } } },
      select: { id: true, name: true, slug: true, description: true, imageUrl: true, _count: { select: { products: { where: { status: "ACTIVE", deletedAt: null } } } } },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      take: 4,
    }),
    getStoreProducts({ page: 1 }),
  ]);
  const products = catalog.products.slice(0, 3);
  const customerId = session?.user.role === "CUSTOMER" ? session.user.id : undefined;
  const savedProductIds = customerId
    ? new Set((await prisma.wishlistItem.findMany({ where: { wishlist: { userId: customerId }, productId: { in: products.map((product) => product.id) } }, select: { productId: true } })).map((item) => item.productId))
    : new Set<string>();
  const categoryIcons = [Circle, Diamond, Square];

  const sectionHeading = (eyebrow: string, title: string, link?: { label: string; href: string }) => (
    <div className="flex items-end justify-between gap-6 border-b border-[#d8d0c3]/70 pb-5">
      <div>
        <p className="store-eyebrow text-muted-foreground">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl text-[#3b3530]">{title}</h2>
      </div>
      {link && (
        <Link href={link.href} className="store-text-link shrink-0 pb-1 text-sm font-medium">
          {link.label}<ArrowUpRight className="size-4 ml-1 inline-block" aria-hidden="true" />
        </Link>
      )}
    </div>
  );

  const categoryCard = (category: (typeof categories)[number], index: number) => {
    const Icon = categoryIcons[index % categoryIcons.length];
    return (
      <Link href={`/category/${category.slug}`} className="group relative flex min-h-[16rem] flex-col overflow-hidden border border-[#c9bdad]/80 bg-[#f9f8f6] p-8 transition-all duration-300 hover:border-[#a58d79] hover:shadow-sm">
        {category.imageUrl && (
          <div className="absolute inset-0 bg-cover bg-center opacity-10 mix-blend-multiply transition-opacity duration-300 group-hover:opacity-20" style={{ backgroundImage: `url(${category.imageUrl})` }} aria-hidden="true" />
        )}
        <div className="absolute inset-x-0 top-0 h-1.5 bg-[#d57959]/0 transition-colors duration-300 group-hover:bg-[#d57959]" aria-hidden="true" />
        <div className="relative flex h-full flex-col">
          <div className="flex items-start justify-between">
            <span className="store-eyebrow text-[#8b5946]">0{index + 1}</span>
            <Icon className="size-8 text-[#a58d79]/60 transition-transform duration-300 group-hover:scale-110 group-hover:text-[#8b5946]" strokeWidth={1} aria-hidden="true" />
          </div>
          <div className="mt-auto pt-10">
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-medium">{category._count.products} product{category._count.products === 1 ? "" : "s"}</p>
            <h3 className="mt-2 text-2xl font-medium tracking-tight text-[#3b3530]">{category.name}</h3>
            {category.description && (
              <p className="mt-3 line-clamp-2 text-[0.9375rem] leading-relaxed text-muted-foreground">{category.description}</p>
            )}
          </div>
        </div>
      </Link>
    );
  };

  return (
    <>
      {/* Premium Hero */}
      <section className="store-container pt-8 sm:pt-16 pb-12 sm:pb-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16 xl:gap-24">
          <div className="py-4">
            <p className="store-eyebrow text-[#8b5946]">The Norva Collection</p>
            <h1 className="mt-6 text-[2.75rem] font-medium leading-[1.05] tracking-tight text-[#2c2825] sm:text-6xl lg:text-[4rem] xl:text-[4.5rem]">
              Useful objects,<br/>chosen with care.
            </h1>
            <p className="mt-8 max-w-[28rem] text-lg leading-relaxed text-[#6d6054]">
              A focused catalog of considered essentials for daily life — selected for material, proportion, and purpose.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-5">
              <Link href="/products" className="store-primary-button px-8 py-3.5 text-base">
                Shop all products <ArrowRight className="size-4.5 ml-2" aria-hidden="true" />
              </Link>
              <Link href="/products/dev-demo-3d" className="store-text-link text-base font-medium text-[#6d6054] hover:text-[#2c2825]">
                Explore in 3D
              </Link>
            </div>
          </div>

          <div className="relative aspect-[4/3] w-full overflow-hidden border border-[#c9bdad]/80 bg-[#f0eee6] shadow-sm sm:aspect-[4/3] lg:aspect-[3/3.5] xl:aspect-[3/3]" aria-label="Editorial product stage">
            {/* Texture overlay */}
            <div className="absolute inset-0 opacity-[0.03] mix-blend-multiply" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }} />
            
            {/* Geometric framing */}
            <div className="absolute inset-5 border border-[#c9bdad]/40" aria-hidden="true" />
            
            {/* Corner accents */}
            <div className="absolute left-10 top-10 size-10 border-l border-t border-[#d57959]" aria-hidden="true" />
            <div className="absolute bottom-10 right-10 size-10 border-b border-r border-[#d57959]" aria-hidden="true" />
            
            {/* Product Composition */}
            <div className="absolute inset-0 flex items-center justify-center">
              {/* Product 1: Background accent */}
              {products[1] && products[1].images[0] && (
                <div className="absolute right-[15%] top-[15%] h-[35%] w-[35%] overflow-hidden border border-[#c9bdad]/50 shadow-sm opacity-80 mix-blend-multiply">
                  <div className="absolute inset-0 bg-[#f9f8f6]" />
                  <img src={products[1].images[0].url} alt="" className="h-full w-full object-cover mix-blend-multiply" />
                </div>
              )}
              
              {/* Abstract element */}
              <div className="absolute left-[20%] top-[30%] h-32 w-20 rounded-t-full border border-[#d57959]/30 bg-[#d57959]/10 backdrop-blur-sm" />
              
              {/* Product 0: Hero piece */}
              {products[0] && products[0].images[0] ? (
                <div className="relative z-10 h-[55%] w-[45%] overflow-hidden border border-[#c9bdad] bg-white shadow-md">
                  <img src={products[0].images[0].url} alt="" className="h-full w-full object-cover" />
                  <div className="absolute bottom-0 left-0 right-0 bg-white/90 px-4 py-3 backdrop-blur-sm border-t border-[#c9bdad]/50">
                    <p className="truncate text-xs font-medium uppercase tracking-wider text-[#3b3530]">{products[0].name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{formatCurrency(Number(products[0].basePrice), settings.currency)}</p>
                  </div>
                </div>
              ) : (
                <div className="relative z-10 size-48 rounded-full border border-[#a58d79] bg-[#e7e1d6] shadow-inner" />
              )}
              
              {/* Abstract element 2 */}
              <div className="absolute bottom-[20%] right-[30%] size-24 rotate-12 border border-[#a58d79]/30 bg-white/40 shadow-sm backdrop-blur-md" />
            </div>

            {/* Editorial text */}
            <div className="absolute bottom-8 left-8 right-8 flex justify-between items-end">
              <div className="hidden sm:block">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8b5946]">Issue 01</p>
              </div>
              <div className="text-right">
                <p className="font-serif text-lg italic text-[#6d6054]">Design for living</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      {categories.length > 0 && (
        <section className="store-container py-16 sm:py-24 border-t border-[#d8d0c3]/40 bg-[#fbfaf9]">
          {sectionHeading("Browse the catalog", "Shop by category", { label: "View all categories", href: "/products" })}
          
          {categories.length === 1 ? (
            <div className="mt-10 max-w-3xl">
              <Link href={`/category/${categories[0].slug}`} className="group relative flex min-h-[22rem] flex-col overflow-hidden border border-[#c9bdad]/80 bg-card p-10 transition-all duration-300 hover:border-[#a58d79] hover:shadow-md">
                <div className="absolute inset-x-0 top-0 h-1.5 bg-[#d57959]/0 transition-colors duration-300 group-hover:bg-[#d57959]" aria-hidden="true" />
                <div className="relative flex h-full flex-col">
                  <div className="flex items-start justify-between">
                    <span className="store-eyebrow text-[#8b5946]">01</span>
                    <Square className="size-10 text-[#a58d79]/60 transition-transform duration-300 group-hover:scale-110 group-hover:text-[#8b5946]" strokeWidth={1} aria-hidden="true" />
                  </div>
                  <div className="mt-auto pt-10">
                    <p className="text-sm uppercase tracking-widest text-muted-foreground font-medium">{categories[0]._count.products} product{categories[0]._count.products === 1 ? "" : "s"}</p>
                    <h3 className="mt-3 text-4xl font-medium tracking-tight text-[#3b3530] transition-colors duration-200 group-hover:text-[#8b5946]">{categories[0].name}</h3>
                    {categories[0].description && (
                      <p className="mt-4 max-w-lg text-lg leading-relaxed text-[#6d6054]">{categories[0].description}</p>
                    )}
                    <div className="mt-8 flex items-center text-sm font-medium text-[#8b5946]">
                      Explore collection <ArrowRight className="ml-2 size-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ) : (
            <div className={`mt-10 grid gap-6 sm:gap-8 ${categories.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
              {categories.map((category, index) => <Fragment key={category.id}>{categoryCard(category, index)}</Fragment>)}
            </div>
          )}
        </section>
      )}

      {/* New arrivals */}
      <section className="bg-white py-16 sm:py-24 border-t border-[#d8d0c3]/40">
        <div className="store-container">
          {sectionHeading("From the collection", products.length ? "New arrivals" : "Collection coming together", { label: "View full catalog", href: "/products" })}
          
          {products.length > 0 ? (
            <div className="mt-10 grid grid-cols-1 gap-y-12 sm:grid-cols-2 gap-x-8 lg:grid-cols-3 lg:gap-x-10">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} currency={settings.currency} initialWishlisted={savedProductIds.has(product.id)} />
              ))}
            </div>
          ) : (
            <div className="mt-10 max-w-2xl border-l-2 border-[#d57959] py-4 pl-6 bg-[#fbfaf9]">
              <p className="text-xl font-medium text-[#3b3530]">Thoughtful products are being prepared for the shop.</p>
              <p className="mt-3 text-base leading-relaxed text-[#6d6054]">The catalog is intentionally quiet for now. Check back as the first collection is published.</p>
            </div>
          )}
        </div>
      </section>

      {/* Brand statement */}
      <section className="store-container py-20 sm:py-32">
        <div className="grid gap-10 border-y border-[#d8d0c3] py-16 sm:py-20 md:grid-cols-2 md:gap-16 items-center">
          <div>
            <p className="store-eyebrow text-[#8b5946]">The Norva standard</p>
            <h2 className="mt-5 text-4xl font-medium leading-[1.1] tracking-tight text-[#2c2825] sm:text-5xl">
              Fewer, better <span className="text-[#d57959] italic font-serif pr-2">choices.</span>
            </h2>
          </div>
          <div className="flex flex-col justify-end">
            <p className="max-w-md text-lg leading-relaxed text-[#6d6054]">
              A focused catalog, transparent product details, and dependable service — without the noise. We believe in providing only what is necessary, crafted to the highest standard.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}