import type { Metadata } from "next";
import { isSafeCallbackUrl } from "@/lib/utils";
import { CustomerRegisterForm } from "@/components/account/customer-register-form";

export const metadata: Metadata = { title: "Create an account" };

export const dynamic = "force-dynamic";

export default async function CustomerRegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.callbackUrl) ? sp.callbackUrl[0] : sp.callbackUrl ?? "";
  const callbackUrl = isSafeCallbackUrl(raw) ? raw : "/account";
  return <CustomerRegisterForm defaultCallbackUrl={callbackUrl} />;
}
