import { BrandManager } from "@/components/admin/catalog-managers";
import { getAdminBrands } from "@/features/brands/queries";

export default async function BrandsAdminPage() {
  const brands = await getAdminBrands();
  return <main className="admin-paper min-h-[calc(100vh-4rem)] px-4 py-7 sm:px-7 lg:px-10"><div className="mx-auto max-w-7xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#8b5946]">Catalog partners</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Brands</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Maintain the makers and labels presented throughout the storefront.</p><div className="mt-7"><BrandManager brands={brands}/></div></div></main>;
}
