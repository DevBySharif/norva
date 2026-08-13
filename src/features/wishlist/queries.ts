import "server-only";
import { prisma } from "@/lib/db/prisma";
export const getWishlistProducts = (userId: string) => prisma.wishlistItem.findMany({ where: { wishlist: { userId }, product: { status: "ACTIVE", deletedAt: null } }, orderBy: { createdAt: "desc" }, select: { product: { select: { id: true, name: true, slug: true, basePrice: true, compareAtPrice: true, brand: { select: { name: true, slug: true } }, images: { where: { isPrimary: true }, take: 1, select: { url: true, altText: true } }, variants: { where: { isActive: true }, select: { price: true, salePrice: true, inventory: { select: { quantity: true, reservedQuantity: true } } } } } } } });
export async function isProductWishlisted(userId: string | undefined, productId: string) {
  if (!userId) return false;
  return Boolean(await prisma.wishlistItem.findFirst({ where: { productId, wishlist: { userId } }, select: { id: true } }));
}
