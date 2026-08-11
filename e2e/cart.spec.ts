/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect, type Page } from "@playwright/test";
import { prisma } from "../src/lib/db/prisma";

test.describe.configure({ mode: "serial" });

test.describe("Guest Cart Flow", () => {
  let page: Page;
  let simpleProduct: any;
  let multiProduct: any;


  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    
    // Clean up
    await prisma.product.deleteMany({ where: { slug: { startsWith: "cart-test-" } } });

    // Create Simple Product
    simpleProduct = await prisma.product.create({
      data: {
        name: "Cart Test Simple",
        slug: "cart-test-simple",
        sku: "CT-SIMP-01",
        basePrice: 55.0,
        status: "ACTIVE",
        category: { create: { name: "Cart Tests", slug: "cart-tests-1" } },
             variants: {
               create: {
                 name: "Default Variant",
                 sku: "CT-SIMP-01",
                 price: 55.0,
                 inventory: { create: { quantity: 10, reorderPoint: 5 } }
               }
             }
      },
      include: { variants: true }
    });

    // Create Multi-variant Product
    multiProduct = await prisma.product.create({
      data: {
        name: "Cart Test Multi",
        slug: "cart-test-multi",
        sku: "CT-MULTI-01",
        basePrice: 65.0,
        status: "ACTIVE",
        category: { connect: { slug: "cart-tests-1" } },
        options: {
          create: [
            {
              name: "Color", normalizedName: "color", position: 0,
              values: {
                create: [
                  { id: "opt-color-black", value: "Black", normalizedValue: "black", position: 0 },
                  { id: "opt-color-white", value: "White", normalizedValue: "white", position: 1 }
                ]
              }
            },
            {
              name: "Size", normalizedName: "size", position: 1,
              values: {
                create: [
                  { id: "opt-size-s", value: "S", normalizedValue: "s", position: 0 },
                  { id: "opt-size-m", value: "M", normalizedValue: "m", position: 1 }
                ]
              }
            }
          ]
        }
      }
    });

    // Create combinations
    await prisma.productVariant.create({
      data: {
        name: "Black / S",
        productId: multiProduct.id,
        combinationKey: "opt-color-black|opt-size-s",
        sku: "CT-MULTI-BLK-S",
        price: 65.0,
        inventory: { create: { quantity: 5, reorderPoint: 2 } },
        optionValues: {
          create: [
            { optionValueId: "opt-color-black" },
            { optionValueId: "opt-size-s" }
          ]
        }
      }
    });

    await prisma.productVariant.create({
      data: {
        name: "White / M",
        productId: multiProduct.id,
        combinationKey: "opt-color-white|opt-size-m",
        sku: "CT-MULTI-WHT-M",
        price: 70.0, // test different price
        inventory: { create: { quantity: 2, reorderPoint: 0 } },
        optionValues: {
          create: [
            { optionValueId: "opt-color-white" },
            { optionValueId: "opt-size-m" }
          ]
        }
      }
    });
  });

  test.afterAll(async () => {
    await page.close();
    await prisma.product.deleteMany({ where: { slug: { startsWith: "cart-test-" } } });
    await prisma.category.deleteMany({ where: { slug: { startsWith: "cart-tests-" } } });
  });

  test("Simple Product Add to Cart", async () => {
    await page.goto(`/products/${simpleProduct.slug}`);
    
    const cartIndicator = page.locator("a[aria-label='Cart'] span");
    await expect(cartIndicator).not.toBeVisible();

    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(cartIndicator).toHaveText("1");

    await page.goto("/cart");
    await expect(page.getByRole("heading", { name: "Your Cart" })).toBeVisible();
    await expect(page.getByText("Cart Test Simple")).toBeVisible();
    await expect(page.getByText("$55.00", { exact: true }).first()).toBeVisible();
    
    // Check quantity input
    const itemRow = page.locator("li").filter({ hasText: "Cart Test Simple" });
    await expect(itemRow.getByTestId("item-quantity")).toHaveText("1"); 
  });

  test("Multi-variant Add to Cart & Separate Lines", async () => {
    await page.goto(`/products/${multiProduct.slug}`);
    
    // Select Black / S
    await page.getByRole("button", { name: "Black", exact: true }).click();
    await page.getByRole("button", { name: "S", exact: true }).click();
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.locator("a[aria-label='Cart'] span")).toHaveText("2"); // 1 simple + 1 multi

    // Select White / M
    await page.getByRole("button", { name: "White", exact: true }).click();
    await page.getByRole("button", { name: "M", exact: true }).click();
    
    // Should show the $70 price
    await expect(page.getByText("$70.00")).toBeVisible();
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.locator("a[aria-label='Cart'] span")).toHaveText("3"); // + 1 more multi

    await page.goto("/cart");
    
    // Header count should be 3 (1 simple + 2 multi)
    await expect(page.locator("a[aria-label='Cart'] span")).toHaveText("3");
    
    // Should see both combinations
    await expect(page.getByText("Black / S")).toBeVisible();
    await expect(page.getByText("White / M")).toBeVisible();
  });

  test("Same Variant Twice merges quantity", async () => {
    await page.goto(`/products/${simpleProduct.slug}`);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.locator("a[aria-label='Cart'] span")).toHaveText("4");
    
    await page.goto("/cart");
    // Quantity for simple product should now be 2
    const itemRow = page.locator("li").filter({ hasText: "Cart Test Simple" });
    await expect(itemRow.getByTestId("item-quantity")).toHaveText("2");
    
    // Total should be: Simple(55*2) + Black(65*1) + White(70*1) = 110 + 65 + 70 = 245
    await expect(page.getByText("$245.00").last()).toBeVisible();
  });

  test("Quantity Increment, Decrement, and Stock Limits", async () => {
    await page.goto("/cart");
    
    // White/M has max 2 stock. Let's try to increment it.
    const whiteRow = page.locator("li").filter({ hasText: "White / M" });
    
    const increaseBtn = whiteRow.getByRole("button", { name: "Increase quantity" });
    await increaseBtn.click(); // Should be 2 now
    await expect(whiteRow.getByTestId("item-quantity")).toHaveText("2");
    
    // Second click should be disabled or not go above 2
    await expect(increaseBtn).toBeDisabled();
    
    // Decrement
    const decreaseBtn = whiteRow.getByRole("button", { name: "Decrease quantity" });
    await decreaseBtn.click(); // Back to 1
    await expect(whiteRow.getByTestId("item-quantity")).toHaveText("1");
  });

  test("Remove Item", async () => {
    await page.goto("/cart");
    
    const blackRow = page.locator("li").filter({ hasText: "Black / S" });
    const removeBtn = blackRow.getByRole("button", { name: /Remove .* from cart/ });
    
    await removeBtn.click();
    
    await expect(page.getByText("Black / S")).not.toBeVisible();
    
    // Total should be updated
    // Simple(55*2) + White(70*1) = 180
    await expect(page.getByText("$180.00").last()).toBeVisible();
    
    // Cart indicator should be 3 (2 simple, 1 white)
    await expect(page.locator("a[aria-label='Cart'] span")).toHaveText("3");
  });

  test("Persistence across reload", async () => {
    await page.goto("/cart");
    await page.reload();
    
    await expect(page.getByText("Cart Test Simple")).toBeVisible();
    await expect(page.locator("a[aria-label='Cart'] span")).toHaveText("3");
  });

  test("Server Authority (Price Change & Product Status)", async () => {
    // Change price of simple product and make White/M draft
    await prisma.productVariant.update({
      where: { id: simpleProduct.variants[0].id },
      data: { price: 99.0 }
    });
    
    await prisma.product.update({
      where: { id: multiProduct.id },
      data: { status: "DRAFT" } // Takes both multi variants offline
    });
    
    await page.goto("/cart");
    
    // Simple product should now show $99.00
    const simpleRow = page.locator("li").filter({ hasText: "Cart Test Simple" });
    await expect(simpleRow.getByText("$99.00")).toBeVisible();
    
    // Multi-variant item (White/M) should be returned as "Unavailable Item" because it's DRAFT
    const unavailableRow = page.locator("li").filter({ hasText: "Unavailable Item" });
    await expect(unavailableRow).toBeVisible();
    await expect(unavailableRow.getByText("Item unavailable")).toBeVisible();
    
    // Subtotal should only include simple product (2 * $99 = $198)
    await expect(page.getByText("$198.00").last()).toBeVisible();
  });

  test("ARCHIVED Product rejection", async () => {
    // Multi product is currently DRAFT from previous test; flip to ARCHIVED
    await prisma.product.update({
      where: { id: multiProduct.id },
      data: { status: "ARCHIVED" }
    });

    await page.goto("/cart");
    await expect(page.locator("li").filter({ hasText: "Unavailable Item" }).first()).toBeVisible();
    await expect(page.locator("li").filter({ hasText: "Unavailable Item" }).first().getByText("Item unavailable")).toBeVisible();
    await expect(page.getByText("$198.00").last()).toBeVisible();
  });

  test("Malformed localStorage recovers safely", async () => {
    await page.goto("/cart");

    // Invalid JSON must not crash the app
    await page.evaluate(() => localStorage.setItem("norva_cart_v1", "{{{{not-json"));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your Cart" })).toBeVisible();
    await expect(page.getByText("Your cart is currently empty.")).toBeVisible();
    await expect(page.locator("a[aria-label='Cart'] span")).not.toBeVisible();

    // Incompatible schema version must also reset safely
    await page.evaluate(() => localStorage.setItem("norva_cart_v1", JSON.stringify({ version: 99, items: [{ variantId: "x", quantity: 2 }] })));
    await page.reload();
    await expect(page.getByText("Your cart is currently empty.")).toBeVisible();
    await expect(page.locator("a[aria-label='Cart'] span")).not.toBeVisible();

    // Cart still usable after recovery
    await page.goto(`/products/${simpleProduct.slug}`);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.locator("a[aria-label='Cart'] span")).toHaveText("1");
  });
});
