"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireCatalogManager } from "@/lib/auth/session";
import { getMediaStorage } from "@/features/media/storage";

export type MediaActionResult = { success: boolean; message: string };
const refresh = (productId: string, slug?: string) => {
  revalidatePath("/"); revalidatePath("/products"); revalidatePath("/admin/products"); revalidatePath(`/admin/products/${productId}`);
  if (slug) revalidatePath(`/products/${slug}`);
};

export async function updateProductImageAlt(productId: string, imageId: string, altText: string): Promise<MediaActionResult> {
  await requireCatalogManager();
  const image = await prisma.productImage.findFirst({ where: { id: imageId, productId }, select: { id: true, product: { select: { slug: true } } } });
  if (!image) return { success: false, message: "Image not found." };
  await prisma.productImage.update({ where: { id: imageId }, data: { altText: altText.trim().slice(0, 300) || null } });
  refresh(productId, image.product.slug);
  return { success: true, message: "Alt text saved." };
}

export async function moveProductImage(productId: string, imageId: string, direction: "up" | "down" | "primary"): Promise<MediaActionResult> {
  await requireCatalogManager();
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { slug: true, images: { orderBy: [{ isPrimary: "desc" }, { position: "asc" }] } } });
  if (!product) return { success: false, message: "Product not found." };
  const images = [...product.images];
  const index = images.findIndex((image) => image.id === imageId);
  if (index < 0) return { success: false, message: "Image not found." };
  const target = direction === "primary" ? 0 : direction === "up" ? Math.max(0, index - 1) : Math.min(images.length - 1, index + 1);
  const [selected] = images.splice(index, 1); images.splice(target, 0, selected);
  await prisma.$transaction(images.map((image, position) => prisma.productImage.update({ where: { id: image.id }, data: { position, isPrimary: position === 0 } })));
  refresh(productId, product.slug);
  return { success: true, message: direction === "primary" ? "Primary image updated." : "Image order updated." };
}

export async function removeProductImage(productId: string, imageId: string): Promise<MediaActionResult> {
  await requireCatalogManager();
  const image = await prisma.productImage.findFirst({ where: { id: imageId, productId }, select: { url: true, product: { select: { slug: true } } } });
  if (!image) return { success: false, message: "Image not found." };
  try { await getMediaStorage().deleteImage(image.url); }
  catch { console.error("Product media asset deletion failed", { productId, imageId }); return { success: false, message: "The image could not be removed. Please try again." }; }
  await prisma.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id: imageId } });
    const remaining = await tx.productImage.findMany({ where: { productId }, orderBy: [{ isPrimary: "desc" }, { position: "asc" }] });
    for (const [position, item] of remaining.entries()) await tx.productImage.update({ where: { id: item.id }, data: { position, isPrimary: position === 0 } });
  });
  refresh(productId, image.product.slug);
  return { success: true, message: "Image removed." };
}
