"use client";

import { useState } from "react";
import { resendVerification } from "@/features/customers/actions";
import { Button } from "@/components/ui/button";

export function VerificationBanner({ email }: { email: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function resend() {
    setPending(true);
    setError("");
    setMessage("");
    const result = await resendVerification();
    setPending(false);
    if (result.ok) {
      setMessage(result.message ?? "A new verification link has been sent.");
    } else {
      setError(result.message);
    }
  }

  return (
    <section aria-label="Email not verified" data-testid="verification-banner" className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-amber-900">Verify your email address</p>
          <p className="mt-0.5 text-sm text-amber-800">
            We sent a verification link to <span className="font-medium">{email}</span>. Click it to activate your account.
          </p>
        </div>
        <Button type="button" onClick={resend} disabled={pending} className="bg-amber-700 text-white hover:bg-amber-800">
          {pending ? "Sending…" : "Resend verification email"}
        </Button>
      </div>
      {message && (
        <p role="status" data-testid="resend-message" className="mt-3 text-sm font-medium text-green-700">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" data-testid="resend-error" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
