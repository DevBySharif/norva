import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { validateVariantOptionSelections } from "./variant-combinations";
import crypto from "crypto";

const prisma = new PrismaClient();
const runId = `e2e-db-option-${crypto.randomBytes(4).toString("hex")}`;

// Helper to create a category for our tests since Product requires a category
let testCategoryId = "";

beforeAll(async () => {
  const category = await prisma.category.create({
    data: {
      name: `Test Category ${runId}`,
      slug: `test-category-${runId}`,
      isActive: true,
    },
  });
  testCategoryId = category.id;
});

afterAll(async () => {
  // 14. NO ORPHANS AFTER CLEANUP
  // Clean up all products starting with our runId.
  // Due to CASCADE, this should delete all associated Variants, Options, OptionValues, and Inventory.
  await prisma.product.deleteMany({
    where: { slug: { startsWith: `product-${runId}-` } },
  });
  
  await prisma.category.deleteMany({
    where: { id: testCategoryId },
  });

  // Verify no orphans
  const leftoverProducts = await prisma.product.count({ where: { slug: { startsWith: `product-${runId}-` } } });
  const leftoverVariants = await prisma.productVariant.count({ where: { sku: { startsWith: `variant-${runId}-` } } });
  const leftoverOptions = await prisma.productOption.count({ where: { product: { slug: { startsWith: `product-${runId}-` } } } });
  
  expect(leftoverProducts).toBe(0);
  expect(leftoverVariants).toBe(0);
  expect(leftoverOptions).toBe(0);
  
  await prisma.$disconnect();
});

describe("Normalized Option Database Integration", () => {
  it("3. TEST PRODUCT A: relation graph resolves correctly", async () => {
    const productA = await prisma.product.create({
      data: {
        name: `Product A ${runId}`,
        slug: `product-${runId}-a`,
        sku: `prod-${runId}-a`,
        basePrice: 10,
        categoryId: testCategoryId,
        options: {
          create: {
            name: "Color",
            normalizedName: "color",
            position: 1,
            values: {
              create: [
                { value: "Black", normalizedValue: "black", position: 1 },
                { value: "White", normalizedValue: "white", position: 2 },
              ],
            },
          },
        },
      },
      include: { options: { include: { values: true } } },
    });

    const blackValue = productA.options[0].values.find((v) => v.normalizedValue === "black");
    expect(blackValue).toBeDefined();

    const variantA = await prisma.productVariant.create({
      data: {
        productId: productA.id,
        name: "Product A - Black",
        sku: `variant-${runId}-a-black`,
        combinationKey: "black",
        optionValues: {
          create: {
            optionValueId: blackValue!.id,
          },
        },
      },
      include: { optionValues: { include: { optionValue: true } } },
    });

    expect(variantA.optionValues).toHaveLength(1);
    expect(variantA.optionValues[0].optionValue.normalizedValue).toBe("black");
  });

  it("4. TEST PRODUCT B: same combinationKey allowed for different product", async () => {
    const productB = await prisma.product.create({
      data: {
        name: `Product B ${runId}`,
        slug: `product-${runId}-b`,
        sku: `prod-${runId}-b`,
        basePrice: 10,
        categoryId: testCategoryId,
      },
    });

    const variantB = await prisma.productVariant.create({
      data: {
        productId: productB.id,
        name: "Product B - Black",
        sku: `variant-${runId}-b-black`,
        combinationKey: "black", // Same as Product A
      },
    });

    expect(variantB.combinationKey).toBe("black");
  });

  it("5. SAME PRODUCT DUPLICATE COMBINATION KEY: rejected", async () => {
    const productA = await prisma.product.findUniqueOrThrow({
      where: { slug: `product-${runId}-a` },
    });

    await expect(
      prisma.productVariant.create({
        data: {
          productId: productA.id,
          name: "Product A - Black Duplicate",
          sku: `variant-${runId}-a-black-dup`,
          combinationKey: "black",
        },
      })
    ).rejects.toThrow(/Unique constraint failed on the fields: \(`productId`,`combinationKey`\)/);
  });

  it("6. NULL COMBINATION KEY COMPATIBILITY: multiple nulls allowed", async () => {
    const productNull = await prisma.product.create({
      data: {
        name: `Product Null ${runId}`,
        slug: `product-${runId}-null`,
        sku: `prod-${runId}-null`,
        basePrice: 10,
        categoryId: testCategoryId,
      },
    });

    // Create first null combinationKey variant
    await prisma.productVariant.create({
      data: {
        productId: productNull.id,
        name: "Null Variant 1",
        sku: `variant-${runId}-null-1`,
        combinationKey: null,
      },
    });

    // Create second null combinationKey variant (should succeed)
    const variant2 = await prisma.productVariant.create({
      data: {
        productId: productNull.id,
        name: "Null Variant 2",
        sku: `variant-${runId}-null-2`,
        combinationKey: null,
      },
    });

    expect(variant2.id).toBeDefined();
    expect(variant2.combinationKey).toBeNull();
  });

  it("7. DUPLICATE VARIANT-OPTION VALUE LINK: rejected by composite ID", async () => {
    const variantA = await prisma.productVariant.findUniqueOrThrow({
      where: { sku: `variant-${runId}-a-black` },
      include: { optionValues: true },
    });
    const optionValueId = variantA.optionValues[0].optionValueId;

    await expect(
      prisma.productVariantOptionValue.create({
        data: {
          variantId: variantA.id,
          optionValueId: optionValueId,
        },
      })
    ).rejects.toThrow(/Unique constraint failed on the fields: \(`variantId`,`optionValueId`\)/);
  });

  it("8. OPTION VALUE OWNERSHIP", async () => {
    const productA = await prisma.product.findUniqueOrThrow({
      where: { slug: `product-${runId}-a` },
      include: { options: { include: { values: true } } },
    });
    
    const blackValue = productA.options[0].values.find((v) => v.normalizedValue === "black");
    const retrievedValue = await prisma.productOptionValue.findUniqueOrThrow({
      where: { id: blackValue!.id },
      include: { option: true },
    });
    
    expect(retrievedValue.option.productId).toBe(productA.id);
  });

  it("9. CROSS-PRODUCT OPTION SAFETY: DB doesn't prevent it, but pure validation does", async () => {
    const productA = await prisma.product.findUniqueOrThrow({
      where: { slug: `product-${runId}-a` },
      include: { options: { include: { values: true } } },
    });
    const blackValue = productA.options[0].values.find((v) => v.normalizedValue === "black")!;

    const productB = await prisma.product.findUniqueOrThrow({
      where: { slug: `product-${runId}-b` },
    });

    const variantB = await prisma.productVariant.findUniqueOrThrow({
      where: { sku: `variant-${runId}-b-black` },
    });

    // The raw DB allows the assignment (so we test that it *would* succeed in Prisma if we let it)
    const rawJoin = await prisma.productVariantOptionValue.create({
      data: {
        variantId: variantB.id,
        optionValueId: blackValue.id,
      },
    });
    expect(rawJoin).toBeDefined();
    
    // Clean it up immediately
    await prisma.productVariantOptionValue.delete({
      where: { variantId_optionValueId: { variantId: variantB.id, optionValueId: blackValue.id } }
    });

    // Now test our server-side pure validation helper that prevents this
    expect(() => validateVariantOptionSelections(productB.id, [
      { optionId: productA.options[0].id, optionProductId: productA.id }
    ])).toThrow("Cross-product option assignment is not allowed.");
  });

  it("10. SAME OPTION MULTIPLE VALUES: pure validation helper prevents it", async () => {
    const productA = await prisma.product.findUniqueOrThrow({
      where: { slug: `product-${runId}-a` },
      include: { options: { include: { values: true } } },
    });
    const colorOption = productA.options[0];
    
    expect(() => validateVariantOptionSelections(productA.id, [
      { optionId: colorOption.id, optionProductId: productA.id },
      { optionId: colorOption.id, optionProductId: productA.id } // Duplicate optionId
    ])).toThrow("Cannot select multiple values from the same option group for a single variant.");
  });

  it("11. VALID MULTI-OPTION VARIANT", async () => {
    const productMulti = await prisma.product.create({
      data: {
        name: `Product Multi ${runId}`,
        slug: `product-${runId}-multi`,
        sku: `prod-${runId}-multi`,
        basePrice: 10,
        categoryId: testCategoryId,
        options: {
          create: [
            {
              name: "Color", normalizedName: "color", position: 0,
              values: { create: [{ value: "Black", normalizedValue: "black", position: 0 }] }
            },
            {
              name: "Size", normalizedName: "size", position: 1,
              values: { create: [{ value: "M", normalizedValue: "m", position: 0 }] }
            }
          ]
        }
      },
      include: { options: { include: { values: true } } }
    });

    const blackVal = productMulti.options.find(o => o.normalizedName === "color")!.values[0];
    const mVal = productMulti.options.find(o => o.normalizedName === "size")!.values[0];

    const variantMulti = await prisma.productVariant.create({
      data: {
        productId: productMulti.id,
        name: "Black / M",
        sku: `variant-${runId}-multi-bm`,
        combinationKey: "black|m",
        optionValues: {
          create: [
            { optionValueId: blackVal.id },
            { optionValueId: mVal.id }
          ]
        }
      },
      include: { optionValues: { include: { optionValue: { include: { option: true } } } } }
    });

    expect(variantMulti.optionValues).toHaveLength(2);
    const optionsSelected = variantMulti.optionValues.map(ov => ov.optionValue.option.normalizedName).sort();
    expect(optionsSelected).toEqual(["color", "size"]);
    expect(variantMulti.combinationKey).toBe("black|m");
  });

  it("12. OPTION ORDER / VALUE ORDER PERSISTENCE", async () => {
    const productOrder = await prisma.product.create({
      data: {
        name: `Product Order ${runId}`,
        slug: `product-${runId}-order`,
        sku: `prod-${runId}-order`,
        basePrice: 10,
        categoryId: testCategoryId,
        options: {
          create: [
            {
              name: "Size", normalizedName: "size", position: 2, // intentionally out of alphabetical order
              values: { create: [
                { value: "L", normalizedValue: "l", position: 3 },
                { value: "S", normalizedValue: "s", position: 1 },
                { value: "M", normalizedValue: "m", position: 2 },
              ] }
            },
            {
              name: "Color", normalizedName: "color", position: 1,
              values: { create: [{ value: "Red", normalizedValue: "red", position: 1 }] }
            }
          ]
        }
      }
    });

    const retrievedProduct = await prisma.product.findUniqueOrThrow({
      where: { id: productOrder.id },
      include: {
        options: {
          orderBy: { position: "asc" },
          include: {
            values: {
              orderBy: { position: "asc" }
            }
          }
        }
      }
    });

    expect(retrievedProduct.options[0].normalizedName).toBe("color");
    expect(retrievedProduct.options[0].position).toBe(1);
    expect(retrievedProduct.options[1].normalizedName).toBe("size");
    expect(retrievedProduct.options[1].position).toBe(2);

    const sizeValues = retrievedProduct.options[1].values;
    expect(sizeValues[0].normalizedValue).toBe("s");
    expect(sizeValues[1].normalizedValue).toBe("m");
    expect(sizeValues[2].normalizedValue).toBe("l");
  });

  it("13. CASCADE / DELETE BEHAVIOR", async () => {
    // We already rely on this in afterAll, but let's test it explicitly
    const productCascade = await prisma.product.create({
      data: {
        name: `Product Cascade ${runId}`,
        slug: `product-${runId}-cascade`,
        sku: `prod-${runId}-cascade`,
        basePrice: 10,
        categoryId: testCategoryId,
        options: {
          create: {
            name: "Test", normalizedName: "test",
            values: { create: { value: "Val", normalizedValue: "val" } }
          }
        }
      },
      include: { options: { include: { values: true } } }
    });

    const valId = productCascade.options[0].values[0].id;
    const variantCascade = await prisma.productVariant.create({
      data: {
        productId: productCascade.id,
        name: "Test Variant",
        sku: `variant-${runId}-cascade-1`,
        optionValues: {
          create: { optionValueId: valId }
        }
      }
    });

    // Delete Product
    await prisma.product.delete({ where: { id: productCascade.id } });

    // Verify cascade deleted variants, options, values, and join table records
    const checkVariant = await prisma.productVariant.findUnique({ where: { id: variantCascade.id } });
    const checkOption = await prisma.productOption.findUnique({ where: { id: productCascade.options[0].id } });
    const checkValue = await prisma.productOptionValue.findUnique({ where: { id: valId } });
    const checkJoin = await prisma.productVariantOptionValue.findUnique({
      where: { variantId_optionValueId: { variantId: variantCascade.id, optionValueId: valId } }
    });

    expect(checkVariant).toBeNull();
    expect(checkOption).toBeNull();
    expect(checkValue).toBeNull();
    expect(checkJoin).toBeNull();
  });
});
