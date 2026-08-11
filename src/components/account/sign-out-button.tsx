"use client";

import { signOut } from "next-auth/react";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className={
        className ??
        "inline-flex min-h-11 items-center justify-center rounded-md border border-[#bcae9d] bg-[#fffdf7]/70 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
      }
    >
      Sign out
    </button>
  );
}
