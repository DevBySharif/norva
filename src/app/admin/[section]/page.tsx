import { notFound } from "next/navigation";
import { EmptyState } from "@/components/shared/empty-state";

const titles = { orders: "Orders", products: "Products", categories: "Categories", brands: "Brands", inventory: "Inventory", customers: "Customers", coupons: "Coupons", reviews: "Reviews", marketing: "Marketing", content: "Content", analytics: "Analytics", staff: "Staff", settings: "Settings" } as const;

export default async function AdminSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!(section in titles)) notFound();
  const title = titles[section as keyof typeof titles];
  return <main className="p-4 sm:p-7"><p className="text-sm text-muted-foreground">Admin / {title}</p><h1 className="mt-1 text-2xl font-semibold">{title}</h1><div className="mt-6"><EmptyState title={`${title} is ready for Phase 2`} description="The route, navigation, and design foundation are in place. This area is intentionally not connected to backend operations yet." /></div></main>;
}
