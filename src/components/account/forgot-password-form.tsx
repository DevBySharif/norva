"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/features/customers/actions";
import { Button } from "@/components/ui/button";

export function ForgotPasswordForm() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    setMessage("");
    const email = String(formData.get("email") ?? "");
    const result = await requestPasswordReset(email);
    setPending(false);
    if (result.ok) {
      setMessage(result.message ?? "If an account exists with that email, a password reset link is on its way.");
    } else {
      setError(result.message);
    }
  }

  const inputClass = "mt-1.5 block min-h-11 w-full rounded-md border border-[#d8d0c3] bg-[#fffdf7]/80 px-3 py-2 text-sm shadow-sm transition-colors focus:border-primary";

  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-8">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#8b5946]">Password reset</p>
        <h1 className="mt-2 text-3xl font-semibold">Forgot your password?</h1>
        <p className="mt-2 text-sm text-gray-600">Enter your account email and we&apos;ll send you a link to reset your password.</p>

        <form action={submit} className="mt-6 space-y-5" noValidate>
          <div>
            <label className="block text-sm font-semibold" htmlFor="forgot-email">Email</label>
            <input id="forgot-email" name="email" type="email" autoComplete="email" className={inputClass} required />
          </div>

          {message && (
            <p role="status" data-testid="forgot-success" className="text-sm font-medium text-green-700">
              {message}
            </p>
          )}
          {error && <p role="alert" data-testid="forgot-error" className="text-sm text-red-700">{error}</p>}

          <Button type="submit" className="h-12 w-full bg-[#D57959] text-white hover:bg-[#c26d50]" disabled={pending}>
            {pending ? "Sending…" : "Send reset link"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-[#D57959] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
