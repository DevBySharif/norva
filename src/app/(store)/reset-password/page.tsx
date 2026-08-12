import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/account/reset-password-form";

export const metadata: Metadata = { title: "Reset password" };

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.token) ? sp.token[0] : sp.token ?? "";

  if (!raw) {
    return (
      <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#8b5946]">Password reset</p>
          <h1 className="mt-2 text-3xl font-semibold">Link invalid</h1>
          <p className="mt-2 text-sm text-gray-600">This password reset link is invalid or has expired. Request a new one.</p>
          <p className="mt-6 text-sm text-gray-600">
            <Link href="/forgot-password" className="font-semibold text-[#D57959] hover:underline">
              Request a new link
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return <ResetPasswordForm token={raw} />;
}
