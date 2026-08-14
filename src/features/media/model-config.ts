export const PRODUCT_MODEL_MAX_BYTES = 25 * 1024 * 1024;
export const PRODUCT_MODEL_CONTENT_TYPES = ["model/gltf-binary", "application/octet-stream"] as const;

export function validateProductModel(file: Pick<File, "name" | "type" | "size">, bytes: Uint8Array) {
  if (!file.name.toLowerCase().endsWith(".glb")) throw new Error("Choose a GLB 3D model.");
  if (!PRODUCT_MODEL_CONTENT_TYPES.includes(file.type as (typeof PRODUCT_MODEL_CONTENT_TYPES)[number])) throw new Error("Choose a GLB 3D model.");
  if (file.size <= 0 || file.size >= PRODUCT_MODEL_MAX_BYTES) throw new Error("3D model must be smaller than 25 MB.");
  const glbMagic = bytes.length >= 12 && bytes[0] === 0x67 && bytes[1] === 0x6c && bytes[2] === 0x54 && bytes[3] === 0x46;
  const version = bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
  const declaredLength = bytes[8] | (bytes[9] << 8) | (bytes[10] << 16) | (bytes[11] << 24);
  if (!glbMagic || version !== 2 || declaredLength !== bytes.length) throw new Error("The file is not a valid GLB 3D model.");
}
