import { describe, expect, it } from "vitest";
import { PRODUCT_IMAGE_LIMIT, PRODUCT_IMAGE_MAX_BYTES, validateProductImage } from "./config";

describe("product media validation", () => {
  it("accepts JPEG, PNG, and WebP signatures", () => {
    expect(() => validateProductImage({ type: "image/jpeg", size: 3 } as File, new Uint8Array([0xff, 0xd8, 0xff]))).not.toThrow();
    expect(() => validateProductImage({ type: "image/png", size: 4 } as File, new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).not.toThrow();
    expect(() => validateProductImage({ type: "image/webp", size: 12 } as File, new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]))).not.toThrow();
  });
  it("rejects unsupported, spoofed, empty, and oversized files", () => {
    expect(() => validateProductImage({ type: "text/plain", size: 3 } as File, new Uint8Array([0xff, 0xd8, 0xff]))).toThrow(/JPEG/);
    expect(() => validateProductImage({ type: "image/png", size: 3 } as File, new Uint8Array([1,2,3]))).toThrow(/contents/);
    expect(() => validateProductImage({ type: "image/png", size: 0 } as File, new Uint8Array())).toThrow(/8 MB/);
    expect(() => validateProductImage({ type: "image/png", size: PRODUCT_IMAGE_MAX_BYTES + 1 } as File, new Uint8Array([0x89,0x50,0x4e,0x47]))).toThrow(/8 MB/);
  });
  it("centralizes the practical eight-image limit", () => expect(PRODUCT_IMAGE_LIMIT).toBe(8));
});
