import { z } from "zod";
export const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const url = z.string().url().optional().or(z.literal(""));
export const categorySchema = z.object({ id: z.string().optional(), name: z.string().trim().min(2).max(120), slug: z.string().trim().max(160), parentId: z.string().optional(), description: z.string().max(5000).optional(), imageUrl: url, seoTitle: z.string().max(160).optional(), seoDescription: z.string().max(300).optional(), isActive: z.boolean() });
export const brandSchema = z.object({ id: z.string().optional(), name: z.string().trim().min(2).max(120), slug: z.string().trim().max(160), description: z.string().max(5000).optional(), logoUrl: url, seoTitle: z.string().max(160).optional(), seoDescription: z.string().max(300).optional(), isActive: z.boolean() });
