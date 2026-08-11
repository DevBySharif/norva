import type { Metadata } from "next";
import { isSafeCallbackUrl } from "@/lib/utils";
import { CustomerLoginForm } from "@/components/account/customer-login-form";

export const metadata: Metadata = { title: "Sign in" };

export const dynamic = "force-dynamic";

export default async function CustomerLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.callbackUrl) ? sp.callbackUrl[0] : sp.callbackUrl ?? "";
  const callbackUrl = isSafeCallbackUrl(raw) ? raw : "/account";
  return <CustomerLoginForm defaultCallbackUrl={callbackUrl} />;
}
