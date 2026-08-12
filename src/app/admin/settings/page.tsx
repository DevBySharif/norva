import { requireCatalogManager } from "@/lib/auth/session";
import StoreSettingsPage from "./StoreSettingsPage";
import { getStoreSettings } from "@/features/store/settings";
import { prisma } from "@/lib/db/prisma";

export const metadata = {
  title: "Store Settings - Admin",
};

export default async function Page() {
  await requireCatalogManager();
  
  const settings = await getStoreSettings();
  const standardMethod = await prisma.shippingMethod.findFirst({
    where: { isActive: true },
    orderBy: { price: "asc" }
  });

  const shippingFee = standardMethod ? standardMethod.price.toFixed(2) : "10.00";

  return (
    <StoreSettingsPage
      settings={{
        ...settings,
        freeShippingThreshold: settings.freeShippingThreshold?.toFixed(2) || "",
      }}
      shippingFee={shippingFee}
    />
  );
}
