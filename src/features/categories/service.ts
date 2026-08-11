import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { canManageCatalog } from "@/lib/auth/catalog-policy";
import { categorySchema, slugify } from "@/lib/validations/catalog";

type Actor = { id: string; role: string } | null | undefined;
export type CategoryMutationResult = { success: boolean; message?: string; id?: string; slug?: string };

async function hasDescendant(id: string, target: string): Promise<boolean> {
  const children = await prisma.category.findMany({ where: { parentId: id }, select: { id: true } });
  for (const child of children) if (child.id === target || await hasDescendant(child.id, target)) return true;
  return false;
}

export async function saveCategoryForActor(input: unknown, actor: Actor): Promise<CategoryMutationResult> {
  if (!actor || !canManageCatalog(actor.role)) return { success: false, message: "Forbidden" };
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
    return { success: true, id: record.id, slug };
  } catch (error) {
    return { success: false, message: error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002" ? "This category slug is already in use." : "Unable to save category." };
  }
}
