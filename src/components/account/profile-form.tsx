"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/features/customers/actions";

export function ProfileForm({ initial }: { initial: { name: string | null; email: string; phone: string | null } }) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.name ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const inputClass = "mt-1.5 block min-h-11 w-full rounded-md border border-[#d8d0c3] bg-[#fffdf7]/80 px-3 py-2 text-sm shadow-sm focus:border-primary";

  return (
    <section aria-labelledby="profile-heading" className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-6">
      <h2 id="profile-heading" className="text-lg font-semibold">Profile details</h2>
      <p className="mt-1 text-sm text-gray-600">Your email is used for orders and stays read-only for now.</p>

      <form
        action={async (formData) => {
          setPending(true);
          setMessage("");
          setError("");
          const result = await updateProfile({ fullName: formData.get("fullName"), phone: formData.get("phone") });
          setPending(false);
          if (result.ok) {
            setMessage("Profile updated.");
            router.refresh();
          } else {
            setError(result.fieldErrors?.fullName ?? result.fieldErrors?.phone ?? result.message);
          }
        }}
        className="mt-5 space-y-5"
        noValidate
      >
        <div>
          <label className="block text-sm font-semibold" htmlFor="profile-fullName">Full name</label>
          <input id="profile-fullName" name="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} autoComplete="name" required />
        </div>
        <div>
          <label className="block text-sm font-semibold" htmlFor="profile-email">Email</label>
          <input id="profile-email" value={initial.email} readOnly className={`${inputClass} cursor-not-allowed bg-gray-100/70`} aria-describedby="profile-email-hint" />
          <p id="profile-email-hint" className="mt-1 text-xs text-gray-500">Email changes require secure verification and are not available yet.</p>
        </div>
        <div>
          <label className="block text-sm font-semibold" htmlFor="profile-phone">Phone <span className="font-normal text-gray-500">(optional)</span></label>
          <input id="profile-phone" name="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} autoComplete="tel" />
        </div>

        {error && <p role="alert" data-testid="profile-error" className="text-sm text-red-700">{error}</p>}
        {message && <p role="status" data-testid="profile-success" className="text-sm text-green-700">{message}</p>}

        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#D57959] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#c26d50] disabled:opacity-60">
          {pending ? "Saving…" : "Save changes"}
        </button>
      </form>
    </section>
  );
}
