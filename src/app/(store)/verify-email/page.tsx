import type { Metadata } from "next";
import Link from "next/link";
import { inspectVerificationToken } from "@/features/notifications/email-verification";
import { VerifyEmailForm } from "@/components/account/verify-email-form";

export const metadata: Metadata = { title: "Verify your email" };

export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.token) ? sp.token[0] : sp.token ?? "";
  const state = await inspectVerificationToken(raw);

  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
      {state === "valid" ? (
        <VerifyEmailForm token={raw} />
      ) : (
        <div className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#8b5946]">Email verification</p>
          <h1 className="mt-2 text-3xl font-semibold">
            {state === "none" ? "Check your email" : "Link invalid or expired"}
          </h1>
          <p className="mt-2 text-sm text-gray-600" data-testid="verify-state-message">
            {state === "none"
              ? "Use the link from the verification email we sent you, or request a new one from your account."
              : "This verification link is invalid or has expired. Sign in and request a new one from your account."}
          </p>
          <p className="mt-6 text-sm text-gray-600">
            <Link href="/login" className="font-semibold text-[#D57959] hover:underline">
              Sign in
            </Link>{" "}
            ·{" "}
            <Link href="/account" className="font-semibold text-[#D57959] hover:underline">
              Go to my account
            </Link>
          </p>
        </div>
      )}
    </main>
  );
}
