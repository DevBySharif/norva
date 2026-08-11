import { CategoryManager } from "@/components/admin/catalog-managers";
import { getAdminCategories } from "@/features/categories/queries";

export default async function CategoriesAdminPage() {
  const categories = await getAdminCategories();
  return <main className="admin-paper min-h-[calc(100vh-4rem)] px-4 py-7 sm:px-7 lg:px-10"><div className="mx-auto max-w-7xl"><p className="text-xs font-bold uppercase tracking-[.18em] text-[#8b5946]">Catalog structure</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Categories</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Organize the browsing hierarchy, parent relationships, and storefront visibility.</p><div className="mt-7"><CategoryManager categories={categories}/></div></div></main>;
}
