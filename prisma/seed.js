const { PrismaClient, ProductStatus, Role } = require("@prisma/client");
const { hash } = require("bcryptjs");
const prisma = new PrismaClient();
async function main() {
  const adminEmail = process.env.DEV_ADMIN_EMAIL;
  const adminPassword = process.env.DEV_ADMIN_PASSWORD;
  if (!adminEmail || !adminPassword) throw new Error("DEV_ADMIN_EMAIL and DEV_ADMIN_PASSWORD are required for seeding.");
  await prisma.user.upsert({ where: { email: adminEmail.toLowerCase() }, update: { role: Role.SUPER_ADMIN, passwordHash: await hash(adminPassword, 12) }, create: { email: adminEmail.toLowerCase(), name: "Development Admin", role: Role.SUPER_ADMIN, passwordHash: await hash(adminPassword, 12) } });
  await prisma.inventory.deleteMany(); await prisma.productImage.deleteMany(); await prisma.productVariant.deleteMany(); await prisma.product.deleteMany(); await prisma.category.deleteMany(); await prisma.brand.deleteMany();
  const living = await prisma.category.create({ data: { name: "Living", slug: "living", description: "Practical pieces for considered spaces." } });
  const table = await prisma.category.create({ data: { name: "Tableware", slug: "tableware", parentId: living.id, description: "Everyday dining essentials." } });
  const travel = await prisma.category.create({ data: { name: "Travel", slug: "travel", description: "Durable companions for days away." } });
  const norva = await prisma.brand.create({ data: { name: "Norva Studio", slug: "norva-studio", description: "Objects with quiet utility." } });
  const field = await prisma.brand.create({ data: { name: "Field Notes", slug: "field-notes", description: "Tools for unhurried exploration." } });
  const create = async (name, slug, sku, categoryId, brandId, price, stock, status = ProductStatus.ACTIVE) => prisma.product.create({ data: { name, slug, sku, categoryId, brandId, basePrice: price, description: `${name} is made for daily use with considered materials and enduring proportions.`, shortDescription: "A practical, lasting everyday essential.", status, images: { create: [{ url: "https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=900&q=80", altText: name, isPrimary: true }] }, variants: { create: [{ name: "Standard", sku: `${sku}-STD`, price, inventory: { create: { quantity: stock, reservedQuantity: 0, reorderPoint: 3 } } }] } } });
  await create("Stoneware serving bowl", "stoneware-serving-bowl", "NS-BOWL-01", table.id, norva.id, "48.00", 12);
  await create("Canvas weekend bag", "canvas-weekend-bag", "FN-BAG-01", travel.id, field.id, "128.00", 2);
  await create("Linen table runner", "linen-table-runner", "NS-LINEN-01", table.id, norva.id, "36.00", 0);
  await create("Archive notebook", "archive-notebook", "FN-NOTE-01", travel.id, field.id, "18.00", 25);
  await create("Studio tray", "studio-tray", "NS-TRAY-01", living.id, norva.id, "64.00", 9, ProductStatus.DRAFT);
}
main().then(() => prisma.$disconnect()).catch(async (error) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
