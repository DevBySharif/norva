import { z } from "zod";
const serverSchema = z.object({ DATABASE_URL: z.string().url().optional(), AUTH_SECRET: z.string().min(32).optional() });
export const env = serverSchema.parse({ DATABASE_URL: process.env.DATABASE_URL, AUTH_SECRET: process.env.AUTH_SECRET });
