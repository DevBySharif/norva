"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { registerCustomer } from "@/features/customers/actions";
import { Button } from "@/components/ui/button";

export function CustomerRegisterForm({ defaultCallbackUrl }: { defaultCallbackUrl: string }) {
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  const inputClass = (hasError: boolean) =>
    `mt-1.5 block min-h-11 w-full rounded-md border bg-[#fffdf7]/80 px-3 py-2 text-sm shadow-sm transition-colors focus:border-primary ${
      hasError ? "border-red-600" : "border-[#d8d0c3]"
    }`;

  const errorMsg = (key: string) => (fieldErrors[key] ? <p id={`error-${key}`} className="mt-1 text-xs text-red-700">{fieldErrors[key]}</p> : null);

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    setFieldErrors({});
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const result = await registerCustomer({
      fullName: formData.get("fullName"),
      email,
      password,
      confirmPassword: formData.get("confirmPassword"),
      phone: formData.get("phone"),
    });

    if (!result.ok) {
      setPending(false);
      if (result.code === "email_taken") {
        setError(result.message);
        return;
      }
      if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      if (!result.fieldErrors || Object.keys(result.fieldErrors).length === 0) setError(result.message);
      return;
    }

    await signIn("credentials", { email, password, callbackUrl: defaultCallbackUrl, redirect: false });
    setPending(false);
    window.location.href = defaultCallbackUrl;
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-8">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-[#8b5946]">Customer account</p>
        <h1 className="mt-2 text-3xl font-semibold">Create your account</h1>
        <p className="mt-2 text-sm text-gray-600">Save addresses, track orders, and check out faster.</p>

        <form action={submit} className="mt-6 space-y-5" noValidate>
          <div>
            <label className="block text-sm font-semibold" htmlFor="register-fullName">Full name</label>
            <input id="register-fullName" name="fullName" type="text" autoComplete="name" className={inputClass(!!fieldErrors.fullName)} aria-invalid={!!fieldErrors.fullName} aria-describedby={fieldErrors.fullName ? "error-fullName" : undefined} required />
            {errorMsg("fullName")}
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="register-email">Email</label>
            <input id="register-email" name="email" type="email" autoComplete="email" className={inputClass(!!fieldErrors.email)} aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "error-email" : undefined} required />
            {errorMsg("email")}
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="register-phone">Phone <span className="font-normal text-gray-500">(optional)</span></label>
            <input id="register-phone" name="phone" type="tel" autoComplete="tel" className={inputClass(!!fieldErrors.phone)} aria-invalid={!!fieldErrors.phone} aria-describedby={fieldErrors.phone ? "error-phone" : undefined} />
            {errorMsg("phone")}
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="register-password">Password</label>
            <input id="register-password" name="password" type="password" minLength={8} autoComplete="new-password" className={inputClass(!!fieldErrors.password)} aria-invalid={!!fieldErrors.password} aria-describedby={fieldErrors.password ? "error-password" : undefined} required />
            <p className="mt-1 text-xs text-gray-500">At least 8 characters.</p>
            {errorMsg("password")}
          </div>
          <div>
            <label className="block text-sm font-semibold" htmlFor="register-confirm">Confirm password</label>
            <input id="register-confirm" name="confirmPassword" type="password" minLength={8} autoComplete="new-password" className={inputClass(!!fieldErrors.confirmPassword)} aria-invalid={!!fieldErrors.confirmPassword} aria-describedby={fieldErrors.confirmPassword ? "error-confirmPassword" : undefined} required />
            {errorMsg("confirmPassword")}
          </div>

          {error && <p role="alert" data-testid="register-error" className="text-sm text-red-700">{error}</p>}

          <Button type="submit" className="h-12 w-full bg-[#D57959] text-white hover:bg-[#c26d50]" disabled={pending}>
            {pending ? "Creating account…" : "Create account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[#D57959] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
