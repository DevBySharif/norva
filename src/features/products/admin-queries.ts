import "server-only";
import { Prisma, ProductStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export async function getProductFormOptions() {
  const [categories, brands] = await Promise.all([prisma.category.findMany({ orderBy: [{ parentId: "asc" }, { name: "asc" }], select: { id: true, name: true, parent: { select: { name: true } } } }), prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })]);
  return { categories: categories.map((category) => ({ ...category, label: category.parent ? `${category.parent.name} › ${category.name}` : category.name })), brands };
}

export async function getAdminProducts(input: { q?: string; status?: string; category?: string; brand?: string; page?: number }) {
  const page = Math.max(input.page || 1, 1); const take = 20;
  const where: Prisma.ProductWhereInput = { deletedAt: null, ...(input.status && Object.values(ProductStatus).includes(input.status as ProductStatus) ? { status: input.status as ProductStatus } : {}), ...(input.category ? { categoryId: input.category } : {}), ...(input.brand ? { brandId: input.brand } : {}), ...(input.q ? { OR: [{ name: { contains: input.q, mode: "insensitive" } }, { slug: { contains: input.q, mode: "insensitive" } }, { sku: { contains: input.q, mode: "insensitive" } }, { variants: { some: { sku: { contains: input.q, mode: "insensitive" } } } }] } : {}) };
  const [products, total] = await prisma.$transaction([prisma.product.findMany({ where, orderBy: { updatedAt: "desc" }, skip: (page - 1) * take, take, include: { category: { select: { name: true } }, brand: { select: { name: true } }, images: { where: { isPrimary: true }, take: 1 }, variants: { orderBy: { createdAt: "asc" }, include: { inventory: true } } } }), prisma.product.count({ where })]);
  return { products, page, pages: Math.max(1, Math.ceil(total / take)), total };
}

export const getAdminProductById = (id: string) => prisma.product.findFirst({ where: { id, deletedAt: null }, include: { model3d: true, images: { orderBy: { position: "asc" } }, options: { orderBy: { position: "asc" }, include: { values: { orderBy: { position: "asc" } } } }, variants: { orderBy: { createdAt: "asc" }, include: { inventory: true, optionValues: { include: { optionValue: true } } } } } });
