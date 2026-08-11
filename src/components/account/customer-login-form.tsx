"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function CustomerLoginForm({ defaultCallbackUrl }: { defaultCallbackUrl: string }) {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const result = await signIn("credentials", { email, password, callbackUrl: defaultCallbackUrl, redirect: false });
    setPending(false);

    if (!result?.ok) {
      setError("Invalid email or password. Please try again.");
      return;
    }
    // Hard navigation so the session cookie is applied by the server on the next request.
    window.location.assign(defaultCallbackUrl);
  }

  const inputClass = "mt-1.5 block min-h-11 w-full rounded-md border border-[#d8d0c3] bg-[#fffdf7]/80 px-3 py-2 text-sm shadow-sm transition-colors focus:border-primary";

  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-8">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#8b5946]">Customer sign in</p>
        <h1 className="mt-2 text-3xl font-semibold">Welcome back</h1>
        <p className="mt-2 text-sm text-gray-600">Sign in to view your orders, addresses, and account details.</p>

        <form action={submit} className="mt-6 space-y-5" noValidate>
          <div>
            <label className="block text-sm font-semibold" htmlFor="login-email">Email</label>
            <input id="login-email" name="email" type="email" autoComplete="email" className={inputClass} required />
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="login-password">Password</label>
            <input id="login-password" name="password" type="password" minLength={8} autoComplete="current-password" className={inputClass} required />
          </div>

          {error && <p role="alert" data-testid="login-error" className="text-sm text-red-700">{error}</p>}

          <Button type="submit" className="h-12 w-full bg-[#D57959] text-white hover:bg-[#c26d50]" disabled={pending}>
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          New here?{" "}
          <Link href="/register" className="font-semibold text-[#D57959] hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
