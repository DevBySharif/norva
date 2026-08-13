import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageCatalog } from "@/lib/auth/catalog-policy";
import { PRODUCT_IMAGE_LIMIT, validateProductImage } from "@/features/media/config";
import { getMediaStorage } from "@/features/media/storage";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getCurrentUser();
    if (!session?.user?.id || !session.user.role) return NextResponse.json({ message: "Authentication required." }, { status: 401 });
    if (!canManageCatalog(session.user.role)) return NextResponse.json({ message: "Forbidden." }, { status: 403 });
    const actor = session.user;
    const { id: productId } = await params;
    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) return NextResponse.json({ message: "Choose an image to upload." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    validateProductImage(file, bytes);
    const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, name: true, slug: true, _count: { select: { images: true } } } });
    if (!product) return NextResponse.json({ message: "Product not found." }, { status: 404 });
    if (product._count.images >= PRODUCT_IMAGE_LIMIT) return NextResponse.json({ message: `A product can have up to ${PRODUCT_IMAGE_LIMIT} images.` }, { status: 409 });
    const stored = await getMediaStorage().uploadImage({ bytes, contentType: file.type, extension: file.name.split(".").pop() || "" });
    try {
      const image = await prisma.$transaction(async (tx) => {
        const count = await tx.productImage.count({ where: { productId } });
        if (count >= PRODUCT_IMAGE_LIMIT) throw new Error("IMAGE_LIMIT");
        const created = await tx.productImage.create({ data: { productId, url: stored.publicUrl, altText: String(form.get("altText") || "").trim().slice(0, 300) || (count === 0 ? product.name : `${product.name} — view ${count + 1}`), position: count, isPrimary: count === 0 } });
        await tx.auditLog.create({ data: { userId: actor.id, action: "PRODUCT_MEDIA_UPLOADED", entityType: "Product", entityId: productId, metadata: { imageId: created.id } } });
        return created;
      });
      return NextResponse.json({ image }, { status: 201 });
    } catch (error) {
      await getMediaStorage().deleteImage(stored.publicUrl).catch(() => console.error("Orphan product media cleanup failed", { productId }));
      if (error instanceof Error && error.message === "IMAGE_LIMIT") return NextResponse.json({ message: `A product can have up to ${PRODUCT_IMAGE_LIMIT} images.` }, { status: 409 });
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error && ["Choose a JPEG, PNG, or WebP image.", "Images must be no larger than 8 MB.", "The file contents do not match its image type.", "Product media storage is not configured."].includes(error.message) ? error.message : "Unable to upload image.";
    return NextResponse.json({ message }, { status: message === "Unable to upload image." ? 500 : 400 });
  }
}
