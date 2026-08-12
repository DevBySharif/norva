"use client";

import { useState } from "react";
import Link from "next/link";
import { verifyEmail } from "@/features/customers/actions";
import { Button } from "@/components/ui/button";

export function VerifyEmailForm({ token }: { token: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError("");
    setMessage("");
    const result = await verifyEmail(token);
    setPending(false);
    if (result.ok) {
      setMessage(result.message ?? "Your email has been verified.");
    } else {
      setError(result.message);
    }
  }

  return (
    <div className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-8 text-center">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-[#8b5946]">Email verification</p>
      <h1 className="mt-2 text-3xl font-semibold">Confirm your email</h1>
      <p className="mt-2 text-sm text-gray-600">Click the button below to finish verifying your email address.</p>

      <Button type="button" onClick={submit} className="mt-6 h-12 bg-[#D57959] text-white hover:bg-[#c26d50]" disabled={pending}>
        {pending ? "Verifying…" : "Verify my email"}
      </Button>

      {message && (
        <p role="status" data-testid="verify-success" className="mt-4 text-sm font-medium text-green-700">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" data-testid="verify-error" className="mt-4 text-sm text-red-700">
          {error}
        </p>
      )}

      <p className="mt-6 text-sm text-gray-600">
        <Link href="/account" className="font-semibold text-[#D57959] hover:underline">
          Go to my account
        </Link>
      </p>
    </div>
  );
}
