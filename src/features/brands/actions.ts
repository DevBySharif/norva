"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireCatalogManager } from "@/lib/auth/session";
import { brandSchema, slugify } from "@/lib/validations/catalog";

export async function saveBrand(input: unknown) {
  const actor = await requireCatalogManager();
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Please correct the brand fields." };
  const data = parsed.data;
  const slug = slugify(data.slug || data.name);
  try {
    const record = data.id
      ? await prisma.brand.update({ where: { id: data.id }, data: { ...data, slug, logoUrl: data.logoUrl || null } })
      : await prisma.brand.create({ data: { ...data, slug, logoUrl: data.logoUrl || null } });
    await prisma.auditLog.create({ data: { userId: actor.id, action: data.id ? "BRAND_UPDATED" : "BRAND_CREATED", entityType: "Brand", entityId: record.id } });
    revalidatePath("/admin/brands");
    revalidatePath(`/brand/${slug}`);
    return { success: true, message: "Brand saved." };
  } catch (error) {
    return { success: false, message: error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? "This brand slug is already in use." : "Unable to save brand." };
  }
}
