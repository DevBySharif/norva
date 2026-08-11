import { z } from "zod";
import { ProductStatus } from "@prisma/client";
import { slugify } from "./catalog";

const money = z.coerce.number().finite().min(0).transform((value) => value.toFixed(2));
const optionalMoney = z.union([z.literal(""), z.undefined(), z.null(), money]).transform((value) => value === "" || value == null ? null : value);

export const optionValueSchema = z.object({
  id: z.string(),
  value: z.string().trim().min(1, "Option value cannot be empty"),
});

export const optionSchema = z.object({
  id: z.string(),
  name: z.string().trim().min(1, "Option name cannot be empty"),
  values: z.array(optionValueSchema).min(1, "Option must have at least one value"),
});

export const variantSchema = z.object({
  id: z.string().optional(),
  combinationKey: z.string().nullable().optional(),
  valueIds: z.array(z.string()).optional(),
  sku: z.string().trim().min(1, "SKU is required").max(100),
  price: money,
  salePrice: optionalMoney,
  costPrice: optionalMoney,
  quantity: z.coerce.number().int().min(0),
  lowStockThreshold: z.coerce.number().int().min(0),
}).superRefine((val, ctx) => {
  if (val.salePrice !== null && Number(val.salePrice) > Number(val.price)) {
    ctx.addIssue({ code: "custom", path: ["salePrice"], message: "Sale price cannot exceed regular price." });
  }
});

export const productSchema = z.object({
  id: z.string().optional(), name: z.string().trim().min(2).max(180), slug: z.string().trim().max(180),
  shortDescription: z.string().trim().max(500).optional(), description: z.string().trim().max(12_000).optional(),
  status: z.nativeEnum(ProductStatus), categoryId: z.string().min(1), brandId: z.string().min(1),
  seoTitle: z.string().trim().max(160).optional(), seoDescription: z.string().trim().max(300).optional(),
  imageUrl: z.union([z.literal(""), z.string().url()]).optional(), imageAlt: z.string().trim().max(300).optional(),
  options: z.array(optionSchema).optional().default([]),
  variants: z.array(variantSchema).min(1, "At least one variant is required"),
}).superRefine((val, ctx) => {
  const optionNames = new Set<string>();
  for (const [i, opt] of val.options.entries()) {
    const name = opt.name.trim().toLowerCase();
    if (optionNames.has(name)) ctx.addIssue({ code: "custom", path: ["options", i, "name"], message: "Option names must be unique" });
    optionNames.add(name);
    const valueNames = new Set<string>();
    for (const [j, v] of opt.values.entries()) {
      const vName = v.value.trim().toLowerCase();
      if (valueNames.has(vName)) ctx.addIssue({ code: "custom", path: ["options", i, "values", j, "value"], message: "Option values must be unique" });
      valueNames.add(vName);
    }
  }
  const skus = new Set<string>();
  for (const [i, variant] of val.variants.entries()) {
    if (skus.has(variant.sku)) ctx.addIssue({ code: "custom", path: ["variants", i, "sku"], message: "SKUs must be unique within product" });
    skus.add(variant.sku);
  }
});

export function normalizedProductSlug(value: string, name: string) { return slugify(value || name); }
