"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireCatalogManager } from "@/lib/auth/session";
import { categorySchema, slugify } from "@/lib/validations/catalog";

type Result = { success: boolean; message?: string };

async function hasDescendant(id: string, target: string): Promise<boolean> {
  const children = await prisma.category.findMany({ where: { parentId: id }, select: { id: true } });
  for (const child of children) if (child.id === target || await hasDescendant(child.id, target)) return true;
  return false;
}

export async function saveCategory(input: unknown): Promise<Result> {
  const actor = await requireCatalogManager();
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Please correct the category fields." };
  const data = parsed.data;
  const slug = slugify(data.slug || data.name);
  if (!slug) return { success: false, message: "A valid slug is required." };
  if (data.id && data.parentId === data.id) return { success: false, message: "A category cannot be its own parent." };
  if (data.id && data.parentId && await hasDescendant(data.id, data.parentId)) return { success: false, message: "A category cannot use one of its descendants as parent." };
  try {
    const record = data.id
      ? await prisma.category.update({ where: { id: data.id }, data: { ...data, slug, parentId: data.parentId || null, imageUrl: data.imageUrl || null } })
      : await prisma.category.create({ data: { ...data, slug, parentId: data.parentId || null, imageUrl: data.imageUrl || null } });
    await prisma.auditLog.create({ data: { userId: actor.id, action: data.id ? "CATEGORY_UPDATED" : "CATEGORY_CREATED", entityType: "Category", entityId: record.id } });
    revalidatePath("/admin/categories");
    revalidatePath(`/category/${slug}`);
    return { success: true, message: "Category saved." };
  } catch (error) {
    return { success: false, message: error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? "This category slug is already in use." : "Unable to save category." };
  }
}
