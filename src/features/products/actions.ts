"use server";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireCatalogManager } from "@/lib/auth/session";
import { normalizedProductSlug, productSchema } from "@/lib/validations/product";
import { generateCombinations, diffVariants, validateVariantOptionSelections } from "./variant-combinations";

export type ProductActionResult = { success: boolean; message: string; id?: string };

async function save(input: unknown, existingId?: string): Promise<ProductActionResult> {
  const actor = await requireCatalogManager();
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Please correct the product fields." };
  
  const data = parsed.data; 
  const slug = normalizedProductSlug(data.slug, data.name);
  if (!slug) return { success: false, message: "A valid product slug is required." };
  
  const [category, brand] = await Promise.all([
    prisma.category.findUnique({ where: { id: data.categoryId }, select: { id: true } }), 
    data.brandId ? prisma.brand.findUnique({ where: { id: data.brandId }, select: { id: true } }) : Promise.resolve(null)
  ]);
  if (!category) return { success: false, message: "The selected category no longer exists." }; 
  if (data.brandId && !brand) return { success: false, message: "The selected brand no longer exists." };

  try {
    const product = await prisma.$transaction(async (tx) => {
      const values = { 
        name: data.name, slug, sku: data.variants[0]?.sku || "", shortDescription: data.shortDescription || null, 
        description: data.description || null, seoTitle: data.seoTitle || null, seoDescription: data.seoDescription || null, 
        status: data.status, categoryId: data.categoryId, brandId: data.brandId || null, 
        basePrice: data.variants[0]?.price || "0", compareAtPrice: data.variants[0]?.salePrice || null 
      };

      if (!existingId) {
        const created = await tx.product.create({ data: { ...values, images: data.imageUrl ? { create: { url: data.imageUrl, altText: data.imageAlt || data.name, position: 0, isPrimary: true } } : undefined } });
        
        if (data.options.length > 0) {
          for (const [oIdx, opt] of data.options.entries()) {
            await tx.productOption.create({
              data: { id: opt.id, productId: created.id, name: opt.name, normalizedName: opt.name.trim().toLowerCase(), position: oIdx, values: { create: opt.values.map((v, vIdx) => ({ id: v.id, value: v.value, normalizedValue: v.value.trim().toLowerCase(), position: vIdx })) } }
            });
          }
        }

        const combinations = generateCombinations(data.options);
        if (data.options.length > 0 && combinations.length !== data.variants.length) throw new Error("Variant matrix mismatch.");

        if (data.options.length === 0) {
           const v = data.variants[0];
           await tx.productVariant.create({
             data: { productId: created.id, name: "Default", sku: v.sku, price: v.price, salePrice: v.salePrice, costPrice: v.costPrice, inventory: { create: { quantity: v.quantity, reorderPoint: v.lowStockThreshold } } }
           });
        } else {
           for (const comb of combinations) {
             const v = data.variants.find(vx => vx.combinationKey === comb.key);
             if (!v) throw new Error(`Missing variant for combination ${comb.label}`);
             
             const variant = await tx.productVariant.create({
               data: { productId: created.id, name: comb.label, sku: v.sku, price: v.price, salePrice: v.salePrice, costPrice: v.costPrice, combinationKey: comb.key, inventory: { create: { quantity: v.quantity, reorderPoint: v.lowStockThreshold } } }
             });
             
             for (const valId of comb.valueIds) {
                await tx.productVariantOptionValue.create({ data: { variantId: variant.id, optionValueId: valId } });
             }
             
             const selections = comb.valueIds.map(valId => {
               const optionGroup = data.options.find(o => o.values.some(val => val.id === valId))!;
               return { optionId: optionGroup.id, optionProductId: created.id };
             });
             validateVariantOptionSelections(created.id, selections);
           }
        }

        await tx.auditLog.create({ data: { userId: actor.id, action: "PRODUCT_CREATED", entityType: "Product", entityId: created.id, metadata: { slug, status: data.status } } }); 
        return created;
      }
      
      const existing = await tx.product.findUnique({ where: { id: existingId }, include: { variants: { include: { inventory: true } }, options: { include: { values: true } } } }); 
      if (!existing) throw new Error("NOT_FOUND");
      
      const desiredCombinations = generateCombinations(data.options);
      const diff = diffVariants(existing.variants, desiredCombinations);

      if (diff.transition.type === "MULTI_TO_SIMPLE") {
         throw new Error("Cannot remove all options from a multi-variant product.");
      }
      
      const updated = await tx.product.update({ where: { id: existingId }, data: values });

      const submittedOptionIds = new Set(data.options.map(o => o.id));
      let inventoryChanged = false;
      for (const exOpt of existing.options) {
        if (!submittedOptionIds.has(exOpt.id)) await tx.productOption.delete({ where: { id: exOpt.id } });
        else {
          const subOpt = data.options.find(o => o.id === exOpt.id)!;
          await tx.productOption.update({ where: { id: exOpt.id }, data: { name: subOpt.name, position: data.options.findIndex(o => o.id === exOpt.id) } });
          const submittedValueIds = new Set(subOpt.values.map(v => v.id));
          for (const exVal of exOpt.values) {
            if (!submittedValueIds.has(exVal.id)) await tx.productOptionValue.delete({ where: { id: exVal.id } });
            else {
               const subVal = subOpt.values.find(v => v.id === exVal.id)!;
               await tx.productOptionValue.update({ where: { id: exVal.id }, data: { value: subVal.value, normalizedValue: subVal.value.trim().toLowerCase(), position: subOpt.values.findIndex(v => v.id === exVal.id) } });
            }
          }
          for (const [vIdx, subVal] of subOpt.values.entries()) {
            if (!exOpt.values.some(v => v.id === subVal.id)) await tx.productOptionValue.create({ data: { id: subVal.id, optionId: exOpt.id, value: subVal.value, normalizedValue: subVal.value.trim().toLowerCase(), position: vIdx } });
          }
        }
      }
      
      for (const [oIdx, subOpt] of data.options.entries()) {
        if (!existing.options.some(o => o.id === subOpt.id)) {
          await tx.productOption.create({
            data: { id: subOpt.id, productId: updated.id, name: subOpt.name, normalizedName: subOpt.name.trim().toLowerCase(), position: oIdx, values: { create: subOpt.values.map((v, vIdx) => ({ id: v.id, value: v.value, normalizedValue: v.value.trim().toLowerCase(), position: vIdx })) } }
          });
        }
      }


      for (const keepVar of diff.keep) {
         const v = data.variants.find(vx => vx.combinationKey === keepVar.combinationKey);
         if (!v) continue; 
         const label = desiredCombinations.find(c => c.key === keepVar.combinationKey)?.label || "";
         const exVar = existing.variants.find(vx => vx.id === keepVar.id);
         const hasInventory = !!exVar?.inventory;
         if (v.quantity !== exVar?.inventory?.quantity) inventoryChanged = true;
         await tx.productVariant.update({
           where: { id: keepVar.id },
           data: {
             sku: v.sku, name: label, price: v.price, salePrice: v.salePrice, costPrice: v.costPrice,
             inventory: hasInventory ? { update: { quantity: v.quantity, reorderPoint: v.lowStockThreshold } } : { create: { quantity: v.quantity, reorderPoint: v.lowStockThreshold } }
           }
         });
      }

      for (let i = 0; i < diff.create.length; i++) {
         const comb = diff.create[i];
         const v = data.variants.find(vx => vx.combinationKey === comb.key);
         if (!v) continue;

         let variantId: string;
         inventoryChanged = true;
         if (diff.transition.type === "SIMPLE_TO_MULTI" && i === 0) {
           const updatedVar = await tx.productVariant.update({
             where: { id: diff.transition.defaultVariantId },
             data: {
               name: comb.label, sku: v.sku, combinationKey: comb.key, price: v.price, salePrice: v.salePrice, costPrice: v.costPrice,
               inventory: existing.variants[0].inventory ? { update: { quantity: v.quantity, reorderPoint: v.lowStockThreshold } } : { create: { quantity: v.quantity, reorderPoint: v.lowStockThreshold } }
             }
           });
           variantId = updatedVar.id;
         } else {
           const createdVar = await tx.productVariant.create({
             data: {
               productId: updated.id, name: comb.label, sku: v.sku, combinationKey: comb.key, price: v.price, salePrice: v.salePrice, costPrice: v.costPrice,
               inventory: { create: { quantity: v.quantity, reorderPoint: v.lowStockThreshold } }
             }
           });
           variantId = createdVar.id;
         }

         for (const valId of comb.valueIds) {
            await tx.productVariantOptionValue.create({ data: { variantId, optionValueId: valId } });
         }
         
         const selections = comb.valueIds.map(valId => {
           const optionGroup = data.options.find(o => o.values.some(val => val.id === valId))!;
           return { optionId: optionGroup.id, optionProductId: updated.id };
         });
         validateVariantOptionSelections(updated.id, selections);
      }
      
      for (const removeVar of diff.remove) {
         await tx.productVariant.delete({ where: { id: removeVar.id } });
      }
      
      if (data.options.length === 0 && diff.transition.type === "NONE") {
         const v = data.variants[0];
         if (v.quantity !== existing.variants[0].inventory?.quantity) inventoryChanged = true;
         await tx.productVariant.update({
           where: { id: existing.variants[0].id },
           data: {
             sku: v.sku, price: v.price, salePrice: v.salePrice, costPrice: v.costPrice,
             inventory: existing.variants[0].inventory ? { update: { quantity: v.quantity, reorderPoint: v.lowStockThreshold } } : { create: { quantity: v.quantity, reorderPoint: v.lowStockThreshold } }
           }
         });
      }

      await tx.auditLog.create({ data: { userId: actor.id, action: "PRODUCT_UPDATED", entityType: "Product", entityId: updated.id, metadata: { slug, status: data.status } } }); 
      if (inventoryChanged) await tx.auditLog.create({ data: { userId: actor.id, action: "INVENTORY_UPDATED", entityType: "Product", entityId: updated.id, metadata: { slug } } }); 
      return updated;
    });
    revalidatePath("/admin/products"); 
    revalidatePath(`/admin/products/${product.id}`); 
    return { success: true, message: existingId ? "Product updated." : "Product created.", id: product.id };
  } catch (error: unknown) { 
    console.error("PRODUCT SAVE ERROR:", error);
    if (error instanceof Error && error.message === "Cannot remove all options from a multi-variant product.") return { success: false, message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { const target = String(error.meta?.target); return { success: false, message: target.includes("sku") ? "This SKU is already in use." : "This product slug is already in use." }; } 
    return { success: false, message: "Unable to save product." }; 
  }
}
export async function createProduct(input: unknown) { return save(input); }
export async function updateProduct(id: string, input: unknown) { return save(input, id); }
