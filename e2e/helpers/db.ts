import { hash } from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";
const prisma = new PrismaClient(); const owned = (slug: string) => { if (!slug.startsWith("e2e-")) throw new Error("Cleanup requires an e2e-owned slug."); };
export const findCategoryBySlug = (slug: string) => prisma.category.findUnique({ where: { slug } });
export const findBrandBySlug = (slug: string) => prisma.brand.findUnique({ where: { slug } });
export const countCategoriesBySlug = (slug: string) => prisma.category.count({ where: { slug } });
export const categoryProductCount = (id: string) => prisma.product.count({ where: { categoryId: id } });
export const seededCategoryWithProducts = () => prisma.category.findFirst({ where: { products: { some: {} } }, select: { id: true, slug: true } });
export const countBrandsBySlug = (slug: string) => prisma.brand.count({ where: { slug } });
export const brandProductCount = (id: string) => prisma.product.count({ where: { brandId: id } });
export const seededBrandWithProducts = () => prisma.brand.findFirst({ where: { products: { some: {} } }, select: { id: true, slug: true } });
export async function createBrandProductFixture(brandSlug: string, productSlug: string) {
  owned(brandSlug); owned(productSlug);
  const category = await prisma.category.findFirst({ select: { id: true } });
  if (!category) throw new Error("E2E brand fixture requires a category.");
  const brand = await prisma.brand.create({ data: { name: brandSlug, slug: brandSlug } });
  await prisma.product.create({ data: { name: productSlug, slug: productSlug, sku: `${productSlug}-sku`, basePrice: "10.00", categoryId: category.id, brandId: brand.id, status: "ACTIVE", variants: { create: { name: "Standard", sku: `${productSlug}-sku-std`, price: "10.00", inventory: { create: { quantity: 1 } } } } } });
  return brand;
}
export const findUserByEmail = (email: string) => prisma.user.findUnique({ where: { email } });
export const findAuditLogsForEntity = (entityType: string, entityId: string) => prisma.auditLog.findMany({ where: { entityType, entityId }, orderBy: { createdAt: "asc" } });
export const countAuditLogsForEntity = (entityType: string, entityId: string) => prisma.auditLog.count({ where: { entityType, entityId } });
export async function createTestCustomer(email: string) { return prisma.user.upsert({ where: { email }, update: { role: Role.CUSTOMER, passwordHash: await hash(email, 12) }, create: { email, role: Role.CUSTOMER, passwordHash: await hash(email, 12) } }); }
export const cleanupTestUser = (email: string) => prisma.user.deleteMany({ where: { email } });
export const cleanupAuditLogsForEntities = (entityIds: string[]) => prisma.auditLog.deleteMany({ where: { entityId: { in: entityIds } } });
export async function cleanupCategoryBySlug(slug: string) { owned(slug); await prisma.category.deleteMany({ where: { OR: [{ slug }, { parent: { slug } }] } }); }
export async function cleanupBrandBySlug(slug: string) { owned(slug); await prisma.brand.deleteMany({ where: { slug } }); }
export const disconnectE2EDatabase = () => prisma.$disconnect();
export const seededCategoryAndBrand = () => Promise.all([prisma.category.findFirst({ select: { id: true, name: true } }), prisma.brand.findFirst({ select: { id: true, name: true } })]);
export const findProductBySlug = (slug: string) => prisma.product.findUnique({ where: { slug }, include: { options: { include: { values: true }, orderBy: { position: "asc" } }, variants: { include: { inventory: true, optionValues: { include: { optionValue: true } } }, orderBy: { createdAt: "asc" } }, images: true } });
export const countProductsBySlug = (slug: string) => prisma.product.count({ where: { slug } });
export async function cleanupProductBySlug(slug: string) { owned(slug); const products = await prisma.product.findMany({ where: { slug }, select: { id: true } }); await prisma.auditLog.deleteMany({ where: { entityType: "Product", entityId: { in: products.map(product => product.id) } } }); await prisma.product.deleteMany({ where: { slug } }); }
