import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { canManageCatalog } from "@/lib/auth/catalog-policy";
import { validateProductModel } from "@/features/media/model-config";
import { getModelStorage } from "@/features/media/storage";

async function authorize() { const session = await getCurrentUser(); if (!session?.user?.id || !session.user.role) return { error: NextResponse.json({ message: "Authentication required." }, { status: 401 }) }; if (!canManageCatalog(session.user.role)) return { error: NextResponse.json({ message: "Forbidden." }, { status: 403 }) }; return { actor: session.user }; }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(); if (auth.error) return auth.error;
  try {
    const { id: productId } = await params; const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true, model3d: true } }); if (!product) return NextResponse.json({ message: "Product not found." }, { status: 404 });
    const form = await request.formData(); const file = form.get("model"); if (!(file instanceof File)) return NextResponse.json({ message: "Choose a GLB 3D model." }, { status: 400 }); const bytes = new Uint8Array(await file.arrayBuffer()); validateProductModel(file, bytes);
    const storage = getModelStorage(); const stored = await storage.uploadModel({ bytes, contentType: "model/gltf-binary" });
    try {
      const model = await prisma.$transaction(async (tx) => { const saved = await tx.product3DModel.upsert({ where: { productId }, create: { productId, storageKey: stored.storageKey, publicUrl: stored.publicUrl, originalFilename: file.name.slice(0, 255), contentType: "model/gltf-binary", fileSize: file.size }, update: { storageKey: stored.storageKey, publicUrl: stored.publicUrl, originalFilename: file.name.slice(0, 255), contentType: "model/gltf-binary", fileSize: file.size } }); await tx.auditLog.create({ data: { userId: auth.actor!.id, action: product.model3d ? "PRODUCT_MODEL_REPLACED" : "PRODUCT_MODEL_UPLOADED", entityType: "Product", entityId: productId, metadata: { modelId: saved.id } } }); return saved; });
      if (product.model3d) await storage.deleteModel(product.model3d.publicUrl).catch(() => console.error("Old product model cleanup failed", { productId, modelId: product.model3d?.id }));
      return NextResponse.json({ model }, { status: 201 });
    } catch (error) { await storage.deleteModel(stored.publicUrl).catch(() => console.error("Orphan product model cleanup failed", { productId })); throw error; }
  } catch (error) { const safe = error instanceof Error && ["Choose a GLB 3D model.", "3D model must be smaller than 25 MB.", "The file is not a valid GLB 3D model.", "Product media storage is not configured."].includes(error.message); return NextResponse.json({ message: safe ? (error as Error).message : "Unable to upload 3D model." }, { status: safe ? 400 : 500 }); }
}
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(); if (auth.error) return auth.error; const { id: productId } = await params; const model = await prisma.product3DModel.findUnique({ where: { productId } }); if (!model) return NextResponse.json({ message: "No 3D model is attached." }, { status: 404 });
  await prisma.product3DModel.delete({ where: { productId } }); await getModelStorage().deleteModel(model.publicUrl).catch(() => console.error("Product model asset cleanup failed", { productId, modelId: model.id })); await prisma.auditLog.create({ data: { userId: auth.actor!.id, action: "PRODUCT_MODEL_REMOVED", entityType: "Product", entityId: productId, metadata: { modelId: model.id } } }); return NextResponse.json({ message: "3D model removed." });
}
