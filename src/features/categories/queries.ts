import "server-only";
import { prisma } from "@/lib/db/prisma";
export async function getCategoryBySlug(slug: string) { return prisma.category.findFirst({ where: { slug, isActive: true }, include: { children: { where: { isActive: true }, orderBy: { position: "asc" } } } }); }
export async function getAdminCategories() { return prisma.category.findMany({ include: { _count: { select: { products: true, children: true } } }, orderBy: [{ position: "asc" }, { name: "asc" }] }); }
