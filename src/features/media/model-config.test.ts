import { describe, expect, it } from "vitest";
import { PRODUCT_MODEL_MAX_BYTES, validateProductModel } from "./model-config";

const valid = new Uint8Array([0x67,0x6c,0x54,0x46,2,0,0,0,12,0,0,0]);
describe("GLB validation", () => {
  it("accepts a valid GLB v2 header", () => expect(() => validateProductModel({ name: "chair.glb", type: "model/gltf-binary", size: valid.length } as File, valid)).not.toThrow());
  it("rejects invalid extension and MIME", () => { expect(() => validateProductModel({ name: "chair.obj", type: "model/gltf-binary", size: 12 } as File, valid)).toThrow(/GLB/); expect(() => validateProductModel({ name: "chair.glb", type: "text/plain", size: 12 } as File, valid)).toThrow(/GLB/); });
  it("rejects fake GLB data", () => expect(() => validateProductModel({ name: "fake.glb", type: "model/gltf-binary", size: 12 } as File, new Uint8Array(12))).toThrow(/valid GLB/));
  it("rejects oversized models", () => expect(() => validateProductModel({ name: "huge.glb", type: "model/gltf-binary", size: PRODUCT_MODEL_MAX_BYTES } as File, valid)).toThrow(/25 MB/));
});
