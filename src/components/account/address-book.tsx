"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
} from "@/features/customers/actions";

export type CustomerAddress = {
  id: string;
  label: string | null;
  recipientName: string | null;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  countryCode: string | null;
  isDefault: boolean;
};

type FormState = {
  label: string;
  recipientName: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

const emptyForm: FormState = { label: "", recipientName: "", phone: "", line1: "", line2: "", city: "", state: "", postalCode: "", country: "", isDefault: false };

export function AddressBook({ addresses }: { addresses: CustomerAddress[] }) {
  const router = useRouter();
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const startCreate = () => { setEditingId(null); setForm(emptyForm); setError(""); setMode("create"); };
  const startEdit = (a: CustomerAddress) => {
    setEditingId(a.id);
    setForm({ label: a.label ?? "", recipientName: a.recipientName ?? "", phone: a.phone ?? "", line1: a.line1, line2: a.line2 ?? "", city: a.city, state: a.state ?? "", postalCode: a.postalCode ?? "", country: a.country ?? "", isDefault: a.isDefault });
    setError("");
    setMode("edit");
  };
  const cancel = () => { setMode("list"); setError(""); };

  async function submit() {
    setPending(true);
    setError("");
    const payload = { ...form };
    const result = mode === "create" ? await createAddress(payload) : await updateAddress({ id: editingId!, ...payload });
    setPending(false);
    if (result.ok) {
      setMode("list");
      router.refresh();
    } else {
      setError(result.message);
    }
  }

  const inputClass = "mt-1.5 block min-h-11 w-full rounded-md border border-[#d8d0c3] bg-[#fffdf7]/80 px-3 py-2 text-sm shadow-sm focus:border-primary";

  return (
    <section aria-labelledby="addresses-heading" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="addresses-heading" className="text-lg font-semibold">Saved addresses</h2>
          <p className="text-sm text-gray-600">Your default address is used to prefill checkout.</p>
        </div>
        {mode === "list" && (
          <button onClick={startCreate} className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#D57959] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#c26d50]">
            Add address
          </button>
        )}
      </div>

      {mode !== "list" ? (
        <form
          action={submit}
          className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-6"
          noValidate
        >
          <h3 className="font-semibold">{mode === "create" ? "New address" : "Edit address"}</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold" htmlFor="addr-label">Label <span className="font-normal text-gray-500">(e.g. Home)</span></label>
              <input id="addr-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className={inputClass} autoComplete="off" />
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="addr-recipient">Recipient name</label>
              <input id="addr-recipient" value={form.recipientName} onChange={(e) => setForm({ ...form, recipientName: e.target.value })} className={inputClass} autoComplete="name" required />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold" htmlFor="addr-phone">Phone <span className="font-normal text-gray-500">(optional)</span></label>
              <input id="addr-phone" type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={inputClass} autoComplete="tel" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold" htmlFor="addr-line1">Address line 1</label>
              <input id="addr-line1" value={form.line1} onChange={(e) => setForm({ ...form, line1: e.target.value })} className={inputClass} autoComplete="address-line1" required />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold" htmlFor="addr-line2">Address line 2 <span className="font-normal text-gray-500">(optional)</span></label>
              <input id="addr-line2" value={form.line2} onChange={(e) => setForm({ ...form, line2: e.target.value })} className={inputClass} autoComplete="address-line2" />
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="addr-city">City</label>
              <input id="addr-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputClass} autoComplete="address-level2" required />
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="addr-state">State / region <span className="font-normal text-gray-500">(optional)</span></label>
              <input id="addr-state" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className={inputClass} autoComplete="address-level1" />
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="addr-postal">Postal code <span className="font-normal text-gray-500">(optional)</span></label>
              <input id="addr-postal" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} className={inputClass} autoComplete="postal-code" />
            </div>
            <div>
              <label className="block text-sm font-semibold" htmlFor="addr-country">Country</label>
              <input id="addr-country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className={inputClass} autoComplete="country-name" />
            </div>
            <label className="flex items-center gap-3 sm:col-span-2">
              <input id="addr-default" type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="size-4 accent-[#D57959]" />
              <span className="text-sm font-medium">Set as my default shipping address</span>
            </label>
          </div>

          {error && <p role="alert" data-testid="address-error" className="mt-4 text-sm text-red-700">{error}</p>}

          <div className="mt-6 flex gap-3">
            <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#D57959] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#c26d50] disabled:opacity-60">
              {pending ? "Saving…" : mode === "create" ? "Save address" : "Save changes"}
            </button>
            <button type="button" onClick={cancel} className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#bcae9d] bg-[#fffdf7]/70 px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted">
              Cancel
            </button>
          </div>
        </form>
      ) : addresses.length === 0 ? (
        <div className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-8 text-center">
          <p className="text-gray-600">You have not saved any addresses yet.</p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" data-testid="address-list">
          {addresses.map((address) => (
            <li key={address.id} className="rounded-2xl border border-[#d8d0c3] bg-[#F0EEE6]/40 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {address.label ? <p className="text-sm font-semibold">{address.label}</p> : null}
                  {address.isDefault ? (
                    <p className="mt-1 inline-flex rounded-full bg-[#8b5946] px-2.5 py-0.5 text-xs font-medium text-white" data-testid="default-address">
                      Default
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="mt-2 text-sm font-medium text-gray-900">{address.recipientName ?? "Recipient"}</p>
              {address.phone ? <p className="text-sm text-gray-600">{address.phone}</p> : null}
              <p className="mt-1 text-sm text-gray-700">{address.line1}</p>
              {address.line2 ? <p className="text-sm text-gray-700">{address.line2}</p> : null}
              <p className="text-sm text-gray-700">
                {[address.city, address.state, address.postalCode].filter(Boolean).join(", ")}
              </p>
              {address.country ? <p className="text-sm text-gray-700">{address.country}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {!address.isDefault && (
                  <button
                    onClick={async () => { await setDefaultAddress(address.id); router.refresh(); }}
                    className="rounded-md border border-[#bcae9d] bg-[#fffdf7]/70 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                  >
                    Make default
                  </button>
                )}
                <button onClick={() => startEdit(address)} className="rounded-md border border-[#bcae9d] bg-[#fffdf7]/70 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted">
                  Edit
                </button>
                <button
                  onClick={async () => {
                    if (window.confirm("Delete this address?")) {
                      await deleteAddress(address.id);
                      router.refresh();
                    }
                  }}
                  className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
