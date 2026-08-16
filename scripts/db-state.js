/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const [users, categories, brands, products, variants, inventory, settings, coupons, shipping, reviews, orders, banners] = await Promise.all([
    p.user.count(),
    p.category.findMany({ select: { name: true, slug: true, isActive: true } }),
    p.brand.findMany({ select: { name: true, slug: true, isActive: true } }),
    p.product.findMany({ select: { name: true, slug: true, status: true } }),
    p.productVariant.count(),
    p.inventory.count(),
    p.storeSettings.findMany(),
    p.coupon.findMany({ select: { code: true, type: true, isActive: true } }),
    p.shippingMethod.findMany({ select: { name: true, code: true, price: true, isActive: true } }),
    p.review.count(),
    p.order.count(),
    p.banner.count(),
  ]);
  console.log("USERS", users);
  console.log("CATEGORIES", JSON.stringify(categories));
  console.log("BRANDS", JSON.stringify(brands));
  console.log("PRODUCTS", JSON.stringify(products));
  console.log("VARIANTS", variants, "INVENTORY", inventory);
  console.log("SETTINGS", JSON.stringify(settings));
  console.log("COUPONS", JSON.stringify(coupons));
  console.log("SHIPPING", JSON.stringify(shipping));
  console.log("REVIEWS", reviews, "ORDERS", orders, "BANNERS", banners);
})().catch((e) => { console.error(e); process.exit(1); }).finally(() => p.$disconnect());
