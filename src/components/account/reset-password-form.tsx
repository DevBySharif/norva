"use client";

import { useState } from "react";
import Link from "next/link";
import { resetPassword } from "@/features/customers/actions";
import { Button } from "@/components/ui/button";

export function ResetPasswordForm({ token }: { token: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setPending(true);
    setError("");
    setMessage("");
    const result = await resetPassword(token, password);
    setPending(false);
    if (result.ok) {
      setMessage(result.message ?? "Your password has been reset.");
    } else {
      setError(result.message);
    }
  }

  const inputClass = "mt-1.5 block min-h-11 w-full rounded-md border border-[#d8d0c3] bg-[#fffdf7]/80 px-3 py-2 text-sm shadow-sm transition-colors focus:border-primary";

  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-8">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#8b5946]">Password reset</p>
        <h1 className="mt-2 text-3xl font-semibold">Choose a new password</h1>
        <p className="mt-2 text-sm text-gray-600">Your old sessions will be signed out for security.</p>

        <form action={submit} className="mt-6 space-y-5" noValidate>
          <div>
            <label className="block text-sm font-semibold" htmlFor="reset-password">New password</label>
            <input id="reset-password" name="password" type="password" minLength={8} autoComplete="new-password" className={inputClass} required />
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="reset-confirm">Confirm password</label>
            <input id="reset-confirm" name="confirm" type="password" minLength={8} autoComplete="new-password" className={inputClass} required />
          </div>

          {message && (
            <p role="status" data-testid="reset-success" className="text-sm font-medium text-green-700">
              {message}
            </p>
          )}
          {error && <p role="alert" data-testid="reset-error" className="text-sm text-red-700">{error}</p>}

          <Button type="submit" className="h-12 w-full bg-[#D57959] text-white hover:bg-[#c26d50]" disabled={pending}>
            {pending ? "Resetting…" : "Reset password"}
          </Button>
        </form>

        {message ? (
          <p className="mt-6 text-center text-sm text-gray-600">
            <Link href="/login" className="font-semibold text-[#D57959] hover:underline">
              Sign in with your new password
            </Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
