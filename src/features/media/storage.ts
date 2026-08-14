import "server-only";
import { randomUUID } from "crypto";
import { mkdir, unlink, writeFile } from "fs/promises";
import path from "path";
import { del, put } from "@vercel/blob";

export type StoredImage = { storageKey: string; publicUrl: string; contentType: string };
export interface MediaStorage { uploadImage(input: { bytes: Uint8Array; contentType: string; extension: string }): Promise<StoredImage>; deleteImage(url: string): Promise<void> }
export type StoredModel = { storageKey: string; publicUrl: string; contentType: string };
export interface ModelStorage { uploadModel(input: { bytes: Uint8Array; contentType: string }): Promise<StoredModel>; deleteModel(url: string): Promise<void> }

const prefix = "/api/media/product/";
const safeExtension = (value: string) => ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" })[value] ?? "bin";

const localStorage: MediaStorage = {
  async uploadImage({ bytes, contentType }) {
    const storageKey = `${randomUUID()}.${safeExtension(contentType)}`;
    const directory = path.join(process.cwd(), ".media", "product");
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, storageKey), bytes);
    return { storageKey, publicUrl: `${prefix}${storageKey}`, contentType };
  },
  async deleteImage(url) {
    if (!url.startsWith(prefix)) return;
    const key = path.basename(url);
    try { await unlink(path.join(process.cwd(), ".media", "product", key)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  },
};

const vercelStorage: MediaStorage = {
  async uploadImage({ bytes, contentType }) {
    const storageKey = `products/${randomUUID()}.${safeExtension(contentType)}`;
    const result = await put(storageKey, Buffer.from(bytes), { access: "public", contentType, addRandomSuffix: false });
    return { storageKey: result.pathname, publicUrl: result.url, contentType };
  },
  async deleteImage(url) { await del(url); },
};

export function getMediaStorage(): MediaStorage {
  const provider = process.env.MEDIA_STORAGE_PROVIDER?.toLowerCase() || (process.env.NODE_ENV === "production" ? "vercel-blob" : "local");
  if (provider === "local" || provider === "test") return localStorage;
  if (provider === "vercel-blob") {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Product media storage is not configured.");
    return vercelStorage;
  }
  throw new Error("Unsupported media storage provider.");
}

export function getModelStorage(): ModelStorage {
  const provider = process.env.MEDIA_STORAGE_PROVIDER?.toLowerCase() || (process.env.NODE_ENV === "production" ? "vercel-blob" : "local");
  if (provider === "local" || provider === "test") return {
    async uploadModel({ bytes, contentType }) {
      const storageKey = `${randomUUID()}.glb`; const directory = path.join(process.cwd(), ".media", "model"); await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, storageKey), bytes);
      return { storageKey, publicUrl: `/api/media/model/${storageKey}`, contentType };
    },
    async deleteModel(url) { if (!url.startsWith("/api/media/model/")) return; try { await unlink(path.join(process.cwd(), ".media", "model", path.basename(url))); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } },
  };
  if (provider === "vercel-blob") {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("Product media storage is not configured.");
    return { async uploadModel({ bytes, contentType }) { const storageKey = `products/models/${randomUUID()}.glb`; const result = await put(storageKey, Buffer.from(bytes), { access: "public", contentType, addRandomSuffix: false }); return { storageKey: result.pathname, publicUrl: result.url, contentType }; }, async deleteModel(url) { await del(url); } };
  }
  throw new Error("Unsupported media storage provider.");
}
