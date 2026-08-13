-- Preserve the legacy variant reference while introducing product-based wishlist identity.
ALTER TABLE "WishlistItem" ADD COLUMN "productId" TEXT;
ALTER TABLE "WishlistItem" ADD COLUMN "productVariantId" TEXT;

-- Backfill every legacy entry through its existing ProductVariant relation.
UPDATE "WishlistItem" AS wi
SET "productId" = pv."productId", "productVariantId" = wi."variantId"
FROM "ProductVariant" AS pv
WHERE pv."id" = wi."variantId";

-- Keep one deterministic entry per wishlist/product before adding the new invariant.
DELETE FROM "WishlistItem"
WHERE "id" IN (
  SELECT "id" FROM (
    SELECT "id", row_number() OVER (PARTITION BY "wishlistId", "productId" ORDER BY "id") AS position
    FROM "WishlistItem"
  ) duplicates WHERE position > 1
);

ALTER TABLE "WishlistItem" ALTER COLUMN "productId" SET NOT NULL;
CREATE INDEX "WishlistItem_productId_idx" ON "WishlistItem"("productId");
CREATE UNIQUE INDEX "WishlistItem_wishlistId_productId_key" ON "WishlistItem"("wishlistId", "productId");
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WishlistItem" DROP CONSTRAINT "WishlistItem_variantId_fkey";
DROP INDEX "WishlistItem_wishlistId_variantId_key";
ALTER TABLE "WishlistItem" DROP COLUMN "variantId";
