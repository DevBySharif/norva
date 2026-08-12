import "server-only";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { canManageCatalog } from "@/lib/auth/catalog-policy";
export async function getCurrentUser() { return getServerSession(authOptions); }
export async function requireCatalogManager() { const session = await getCurrentUser(); if (!session?.user?.id || !session.user.role) redirect("/admin/login"); if (!canManageCatalog(session.user.role)) throw new Error("Forbidden"); return session.user; }
export const requireAdminUser = requireCatalogManager;
/** Order fulfillment and management authorization. Reuses the catalog-manager policy (SUPER_ADMIN / ADMIN / MANAGER). */
export const requireOrderManager = requireCatalogManager;
/** Customer-only session enforcement for account routes and actions. */
export async function requireCustomer() {
  const session = await getCurrentUser();
  if (!session?.user?.id || session.user.role !== "CUSTOMER") redirect("/login");
  return session.user;
}
