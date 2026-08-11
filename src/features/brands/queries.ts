import "server-only";
import { prisma } from "@/lib/db/prisma";
export async function getBrandBySlug(slug: string) { return prisma.brand.findFirst({ where: { slug, isActive: true } }); }
export async function getAdminBrands() { return prisma.brand.findMany({ include: { _count: { select: { products: true } } }, orderBy: { name: "asc" } }); }
