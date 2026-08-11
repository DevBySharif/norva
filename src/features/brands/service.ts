import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { canManageCatalog } from "@/lib/auth/catalog-policy";
import { brandSchema, slugify } from "@/lib/validations/catalog";

type Actor = { id: string; role: string } | null | undefined;
export type BrandMutationResult = { success: boolean; message?: string; id?: string; slug?: string };

export async function saveBrandForActor(input: unknown, actor: Actor): Promise<BrandMutationResult> {
  if (!actor || !canManageCatalog(actor.role)) return { success: false, message: "Forbidden" };
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Please correct the brand fields." };
  const data = parsed.data;
  const slug = slugify(data.slug || data.name);

  try {
    const record = data.id
      ? await prisma.brand.update({ where: { id: data.id }, data: { ...data, slug, logoUrl: data.logoUrl || null } })
      : await prisma.brand.create({ data: { ...data, slug, logoUrl: data.logoUrl || null } });
    await prisma.auditLog.create({ data: { userId: actor.id, action: data.id ? "BRAND_UPDATED" : "BRAND_CREATED", entityType: "Brand", entityId: record.id } });
    return { success: true, id: record.id, slug };
  } catch (error) {
    return { success: false, message: error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? "This brand slug is already in use." : "Unable to save brand." };
  }
}
