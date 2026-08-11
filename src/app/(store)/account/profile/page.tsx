import type { Metadata } from "next";
import { requireCustomer } from "@/lib/auth/session";
import { getCustomerProfile } from "@/features/customers/queries";
import { AccountNav } from "@/components/account/account-nav";
import { ProfileForm } from "@/components/account/profile-form";

export const metadata: Metadata = { title: "Profile" };

export const dynamic = "force-dynamic";

export default async function AccountProfilePage() {
  const user = await requireCustomer();
  const profile = await getCustomerProfile(user.id);
  if (!profile) return null;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold">Profile</h1>
      <p className="mt-1 text-sm text-gray-600">Manage the details used to personalize your account.</p>

      <div className="mt-8">
        <AccountNav />
      </div>

      <div className="mt-8">
        <ProfileForm initial={{ name: profile.name, email: profile.email, phone: profile.phone }} />
      </div>
    </main>
  );
}
