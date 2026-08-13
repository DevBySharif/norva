/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const [summary] = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*)::int AS "wishlistItems",
      COUNT(DISTINCT w."userId")::int AS "usersWithWishlistItems",
      COUNT(*) FILTER (WHERE wi."productId" IS NULL)::int AS "missingProductId",
      COUNT(*) FILTER (WHERE wi."productVariantId" IS NULL)::int AS "missingLegacyVariantId",
      COUNT(*) - COUNT(DISTINCT (wi."wishlistId", wi."productId"))::int AS "duplicateWishlistProducts"
    FROM "WishlistItem" wi
    JOIN "Wishlist" w ON w."id" = wi."wishlistId"
  `);

  const [integrity] = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*) FILTER (WHERE p."id" IS NULL)::int AS "orphanProducts",
      COUNT(*) FILTER (WHERE pv."id" IS NULL)::int AS "orphanLegacyVariants"
    FROM "WishlistItem" wi
    LEFT JOIN "Product" p ON p."id" = wi."productId"
    LEFT JOIN "ProductVariant" pv ON pv."id" = wi."productVariantId"
  `);

  const [unrelated] = await prisma.$queryRawUnsafe(`
    SELECT
      (SELECT COUNT(*) FROM "Product")::int AS "products",
      (SELECT COUNT(*) FROM "ProductVariant")::int AS "productVariants",
      (SELECT COUNT(*) FROM "Inventory")::int AS "inventoryRecords",
      (SELECT COUNT(*) FROM "Order")::int AS "orders",
      (SELECT COUNT(*) FROM "User")::int AS "users"
  `);

  console.log(
    JSON.stringify({ summary, integrity, unrelated }, (_key, value) =>
      typeof value === "bigint" ? Number(value) : value,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
