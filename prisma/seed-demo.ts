import { PrismaClient, ProductStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding development demo catalog...");

  // Get categories/brands
  let living = await prisma.category.findUnique({ where: { slug: "living" } });
  if (!living) living = await prisma.category.create({ data: { name: "Living", slug: "living" } });
  let norva = await prisma.brand.findUnique({ where: { slug: "norva-studio" } });
  if (!norva) norva = await prisma.brand.create({ data: { name: "Norva Studio", slug: "norva-studio" } });

  // 1. DEVELOPMENT DEMO - Simple Product
  await prisma.product.upsert({
    where: { slug: "dev-demo-simple" },
    update: {},
    create: {
      name: "[DEVELOPMENT DEMO] Simple Product",
      slug: "dev-demo-simple",
      sku: "DEMO-SIMP-01",
      categoryId: living.id,
      brandId: norva.id,
      basePrice: "25.00",
      description: "A simple product for development and testing.",
      status: ProductStatus.ACTIVE,
      variants: {
        create: [{
          name: "Standard",
          sku: "DEMO-SIMP-01-STD",
          price: "25.00",
          inventory: {
            create: { quantity: 50, reservedQuantity: 0 }
          }
        }]
      }
    }
  });

  // 2. DEVELOPMENT DEMO - Variant Product
  const variantProduct = await prisma.product.upsert({
    where: { slug: "dev-demo-variant" },
    update: {},
    create: {
      name: "[DEVELOPMENT DEMO] Variant Product",
      slug: "dev-demo-variant",
      sku: "DEMO-VAR-01",
      categoryId: living.id,
      brandId: norva.id,
      basePrice: "40.00",
      description: "A variant product with color and size options.",
      status: ProductStatus.ACTIVE,
      options: {
        create: [
          { name: "Color", normalizedName: "color", position: 0, values: { create: [{ value: "Red", normalizedValue: "red", position: 0 }, { value: "Blue", normalizedValue: "blue", position: 1 }] } },
          { name: "Size", normalizedName: "size", position: 1, values: { create: [{ value: "Small", normalizedValue: "small", position: 0 }, { value: "Large", normalizedValue: "large", position: 1 }] } }
        ]
      }
    }
  });

  // Check if we need to create variants
  const existingVariants = await prisma.productVariant.count({ where: { productId: variantProduct.id } });
  if (existingVariants === 0) {
    const colorOption = await prisma.productOption.findUnique({ where: { productId_normalizedName: { productId: variantProduct.id, normalizedName: "color" } }, include: { values: true } });
    const sizeOption = await prisma.productOption.findUnique({ where: { productId_normalizedName: { productId: variantProduct.id, normalizedName: "size" } }, include: { values: true } });
    
    if (colorOption && sizeOption) {
      const red = colorOption.values.find(v => v.normalizedValue === "red");
      const blue = colorOption.values.find(v => v.normalizedValue === "blue");
      const small = sizeOption.values.find(v => v.normalizedValue === "small");
      const large = sizeOption.values.find(v => v.normalizedValue === "large");
      
      if (red && blue && small && large) {
        await prisma.productVariant.create({
          data: {
            productId: variantProduct.id,
            name: "Red / Small",
            sku: "DEMO-VAR-R-S",
            price: "40.00",
            combinationKey: `${red.id},${small.id}`,
            isActive: true,
            inventory: { create: { quantity: 10 } },
            optionValues: {
              create: [
                { optionValueId: red.id },
                { optionValueId: small.id }
              ]
            }
          }
        });
        await prisma.productVariant.create({
          data: {
            productId: variantProduct.id,
            name: "Blue / Large",
            sku: "DEMO-VAR-B-L",
            price: "45.00",
            combinationKey: `${blue.id},${large.id}`,
            isActive: true,
            inventory: { create: { quantity: 5 } },
            optionValues: {
              create: [
                { optionValueId: blue.id },
                { optionValueId: large.id }
              ]
            }
          }
        });
      }
    }
  }

  // 3. DEVELOPMENT DEMO - 3D Product
  await prisma.product.upsert({
    where: { slug: "dev-demo-3d" },
    update: {
      model3d: {
        upsert: {
          create: {
            storageKey: "demo.glb",
            publicUrl: "/demo.glb",
            originalFilename: "demo.glb",
            contentType: "model/gltf-binary",
            fileSize: 1024
          },
          update: {}
        }
      }
    },
    create: {
      name: "[DEVELOPMENT DEMO] 3D Viewer Product",
      slug: "dev-demo-3d",
      sku: "DEMO-3D-01",
      categoryId: living.id,
      brandId: norva.id,
      basePrice: "99.00",
      description: "A product configured for the 3D model viewer.",
      status: ProductStatus.ACTIVE,
      variants: {
        create: [{
          name: "Standard",
          sku: "DEMO-3D-01-STD",
          price: "99.00",
          inventory: {
            create: { quantity: 100, reservedQuantity: 0 }
          }
        }]
      },
      model3d: {
        create: {
          storageKey: "demo.glb",
          publicUrl: "/demo.glb",
          originalFilename: "demo.glb",
          contentType: "model/gltf-binary",
          fileSize: 1024
        }
      }
    }
  });

  console.log("Demo seed complete.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
