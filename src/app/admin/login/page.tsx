"use client";

import { useState } from "react";
import { getSession, signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

const adminRoles = new Set(["SUPER_ADMIN", "ADMIN", "MANAGER"]);

export default function AdminLoginPage() {
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setError("");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const result = await signIn("credentials", { email, password, callbackUrl: "/admin", redirect: false });
    setPending(false);

    if (!result?.ok) {
      setError("Invalid email or password.");
      return;
    }

    const session = await getSession();
    if (session?.user && !adminRoles.has(String(session.user.role))) {
      await signOut({ redirect: false });
      setError("The admin area is restricted to authorized administrator accounts. Please use the customer sign in instead.");
      return;
    }

    window.location.assign(result.url ?? "/admin");
  }

  return <main className="grid min-h-screen place-items-center p-4"><form action={submit} className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-sm"><p className="text-sm font-medium text-muted-foreground">NORVA / ADMIN</p><h1 className="mt-2 text-2xl font-semibold">Sign in</h1><p className="mt-2 text-sm text-muted-foreground">Use your authorized administrator account.</p><label className="mt-6 block text-sm font-medium" htmlFor="email">Email</label><input required id="email" name="email" type="email" autoComplete="email" className="mt-1 h-10 w-full rounded-md border bg-background px-3"/><label className="mt-4 block text-sm font-medium" htmlFor="password">Password</label><input required id="password" name="password" type="password" minLength={8} autoComplete="current-password" className="mt-1 h-10 w-full rounded-md border bg-background px-3"/>{error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}<Button type="submit" className="mt-6 w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button></form></main>;
}
