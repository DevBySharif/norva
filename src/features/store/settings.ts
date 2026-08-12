import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

export type StoreSettingsConfig = {
  storeName: string;
  currency: string;
  freeShippingThreshold: Prisma.Decimal | null;
  supportEmail: string | null;
};

export async function getStoreSettings(): Promise<StoreSettingsConfig> {
  let settings = await prisma.storeSettings.findUnique({ where: { id: "default" } });
  
  if (!settings) {
    settings = await prisma.storeSettings.create({
      data: {
        id: "default",
        storeName: "Norva",
        currency: "USD",
        freeShippingThreshold: new Prisma.Decimal(100.00),
      }
    });
  }

  return {
    storeName: settings.storeName,
    currency: settings.currency,
    freeShippingThreshold: settings.freeShippingThreshold,
    supportEmail: settings.supportEmail,
  };
}
