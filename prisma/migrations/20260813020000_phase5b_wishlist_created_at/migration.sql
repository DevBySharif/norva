-- Align the safely migrated WishlistItem table with its Prisma model.
ALTER TABLE "WishlistItem"
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
