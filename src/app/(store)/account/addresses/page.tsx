import type { Metadata } from "next";
import { requireCustomer } from "@/lib/auth/session";
import { getCustomerAddresses } from "@/features/customers/queries";
import { AccountNav } from "@/components/account/account-nav";
import { AddressBook, type CustomerAddress } from "@/components/account/address-book";

export const metadata: Metadata = { title: "Addresses" };

export const dynamic = "force-dynamic";

export default async function AccountAddressesPage() {
  const user = await requireCustomer();
  const addresses = await getCustomerAddresses(user.id);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold">Addresses</h1>
      <p className="mt-1 text-sm text-gray-600">Save shipping addresses to make checkout faster.</p>

      <div className="mt-8">
        <AccountNav />
      </div>

      <div className="mt-8">
        <AddressBook addresses={addresses as CustomerAddress[]} />
      </div>
    </main>
  );
}
