export const PRODUCT_IMAGE_LIMIT = 8;
export const PRODUCT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export function validateProductImage(file: Pick<File, "type" | "size">, bytes: Uint8Array) {
  if (!PRODUCT_IMAGE_TYPES.includes(file.type as (typeof PRODUCT_IMAGE_TYPES)[number])) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size <= 0 || file.size > PRODUCT_IMAGE_MAX_BYTES) throw new Error("Images must be no larger than 8 MB.");
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if ((file.type === "image/jpeg" && !jpeg) || (file.type === "image/png" && !png) || (file.type === "image/webp" && !webp)) throw new Error("The file contents do not match its image type.");
}
