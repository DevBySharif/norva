import "server-only";
import { ProductStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export const productCardSelect = { id: true, name: true, slug: true, basePrice: true, compareAtPrice: true, brand: { select: { name: true, slug: true } }, images: { orderBy: [{ isPrimary: "desc" }, { position: "asc" }], take: 1, select: { url: true, altText: true } }, variants: { where: { isActive: true }, select: { price: true, salePrice: true, inventory: { select: { quantity: true, reservedQuantity: true } } } }, reviews: { where: { isPublished: true }, select: { rating: true } } } satisfies Prisma.ProductSelect;

export async function getStoreProducts(input: { q?: string; brand?: string; category?: string; sort?: string; page?: number }) {
  const page = Math.max(input.page ?? 1, 1); const take = 24;
  const where: Prisma.ProductWhereInput = { status: ProductStatus.ACTIVE, deletedAt: null, ...(input.q ? { OR: [{ name: { contains: input.q, mode: "insensitive" } }, { slug: { contains: input.q, mode: "insensitive" } }, { sku: { contains: input.q, mode: "insensitive" } }] } : {}), ...(input.brand ? { brand: { slug: input.brand } } : {}), ...(input.category ? { category: { slug: input.category } } : {}) };
  const orderBy: Prisma.ProductOrderByWithRelationInput = input.sort === "price-asc" ? { basePrice: "asc" } : input.sort === "price-desc" ? { basePrice: "desc" } : input.sort === "name" ? { name: "asc" } : { createdAt: "desc" };
  const [products, total] = await prisma.$transaction([prisma.product.findMany({ where, select: productCardSelect, orderBy, skip: (page - 1) * take, take }), prisma.product.count({ where })]);
  return { products, total, page, pages: Math.max(1, Math.ceil(total / take)) };
}

export async function getProductBySlug(slug: string) { return prisma.product.findFirst({ where: { slug, status: ProductStatus.ACTIVE, deletedAt: null }, select: { id: true, name: true, slug: true, model3d: { select: { publicUrl: true } }, shortDescription: true, description: true, seoTitle: true, seoDescription: true, basePrice: true, compareAtPrice: true, brand: true, category: true, images: { orderBy: { position: "asc" } }, options: { orderBy: { position: "asc" }, include: { values: { orderBy: { position: "asc" } } } }, variants: { where: { isActive: true }, select: { id: true, name: true, sku: true, price: true, salePrice: true, inventory: { select: { quantity: true, reservedQuantity: true } }, optionValues: { select: { optionValueId: true } } }, orderBy: { createdAt: "asc" } } } }); }
