"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireCustomer } from "@/lib/auth/session";

export async function toggleWishlist(productId: string) {
  const user = await requireCustomer();
  const product = await prisma.product.findFirst({ where: { id: productId, status: "ACTIVE", deletedAt: null }, select: { id: true } });
  if (!product) return { success: false, message: "This product is unavailable." };
  const wishlist = await prisma.wishlist.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
  const current = await prisma.wishlistItem.findUnique({ where: { wishlistId_productId: { wishlistId: wishlist.id, productId } } });
  if (current) await prisma.wishlistItem.delete({ where: { id: current.id } }); else await prisma.wishlistItem.create({ data: { wishlistId: wishlist.id, productId } });
  revalidatePath("/wishlist"); revalidatePath("/products"); return { success: true, saved: !current };
}
