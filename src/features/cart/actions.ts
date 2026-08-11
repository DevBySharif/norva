"use server";

import { prisma } from "@/lib/db/prisma";
import { ProductStatus } from "@prisma/client";
import { CartItemInput } from "@/hooks/use-cart";

export async function hydrateCart(items: CartItemInput[]) {
  if (!items.length) return [];

  const variantIds = items.map((i) => i.variantId);

  const variants = await prisma.productVariant.findMany({
    where: {
      id: { in: variantIds },
      isActive: true,
      product: {
        status: ProductStatus.ACTIVE,
        deletedAt: null,
      },
    },
    select: {
      id: true,
      price: true,
      salePrice: true,
      inventory: {
        select: {
          quantity: true,
          reservedQuantity: true,
        },
      },
      optionValues: {
        select: {
          optionValue: {
            select: {
              value: true,
              option: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
      product: {
        select: {
          name: true,
          slug: true,
          images: {
            where: { isPrimary: true },
            take: 1,
            select: {
              url: true,
              altText: true,
            },
          },
        },
      },
    },
  });

  return items.map((item) => {
    const variant = variants.find((v) => v.id === item.variantId);
    
    if (!variant) {
      return {
        variantId: item.variantId,
        quantity: 0,
        requestedQuantity: item.quantity,
        isAvailable: false,
        reason: "unavailable" as const,
        price: 0,
        salePrice: null,
        productName: "Unavailable Item",
        productSlug: "",
        image: null,
        options: [],
        maxAvailable: 0,
      };
    }

    const availableQuantity = (variant.inventory?.quantity ?? 0) - (variant.inventory?.reservedQuantity ?? 0);
    const isAvailable = availableQuantity > 0;
    
    // Cap requested quantity to available stock
    const safeQuantity = isAvailable ? Math.min(item.quantity, availableQuantity) : 0;

    return {
      variantId: variant.id,
      quantity: safeQuantity,
      requestedQuantity: item.quantity,
      isAvailable,
      reason: !isAvailable ? "out_of_stock" as const : safeQuantity < item.quantity ? "stock_adjusted" as const : null,
      price: Number(variant.price),
      salePrice: variant.salePrice ? Number(variant.salePrice) : null,
      productName: variant.product.name,
      productSlug: variant.product.slug,
      image: variant.product.images[0] ?? null,
      options: variant.optionValues.map((ov) => ({
        name: ov.optionValue.option.name,
        value: ov.optionValue.value,
      })),
      maxAvailable: availableQuantity,
    };
  });
}
