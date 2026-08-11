"use client";

import { useState, useTransition } from "react";
import { saveBrand } from "@/features/brands/actions";
import { saveCategory } from "@/features/categories/actions";

type Category = { id: string; name: string; slug: string; parentId: string | null; description: string | null; imageUrl: string | null; seoTitle: string | null; seoDescription: string | null; isActive: boolean };
type Brand = { id: string; name: string; slug: string; description: string | null; logoUrl: string | null; seoTitle: string | null; seoDescription: string | null; isActive: boolean };
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

function FormMessage({ message }: { message: string }) {
  if (!message) return null;
  return <p role="status" aria-live="polite" className="rounded-md border border-[#d4b29f] bg-[#fbebe4] px-3 py-2 text-sm font-medium text-[#6d3829]">{message}</p>;
}

function FormHeader({ editing, noun }: { editing: boolean; noun: string }) {
  return <div className="border-b border-[#dfd5c7] pb-4"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#8b5946]">{editing ? "Editing existing record" : "New catalog record"}</p><h2 className="mt-1 text-xl font-semibold">{editing ? `Edit ${noun}` : `Create ${noun}`}</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">{editing ? "Changes are saved to the storefront catalog when you confirm." : `Add a ${noun} with the information customers and staff need.`}</p></div>;
}

export function CategoryForm({ categories, initial }: { categories: Category[]; initial?: Category }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const editing = Boolean(initial);

  return <form className="grid gap-4 rounded-xl border border-[#cfc4b4] bg-card/95 p-5 shadow-[0_1px_2px_rgb(63_45_29/.06)] sm:p-6" action={(formData) => start(async () => { const result = await saveCategory({ id: initial?.id, name: formData.get("name"), slug: formData.get("slug"), parentId: formData.get("parentId") || undefined, description: formData.get("description") || undefined, imageUrl: formData.get("imageUrl") || undefined, seoTitle: formData.get("seoTitle") || undefined, seoDescription: formData.get("seoDescription") || undefined, isActive: formData.get("isActive") === "on" }); setMessage(result.message ?? ""); })}><FormHeader editing={editing} noun="category"/><div className="grid gap-4 sm:grid-cols-2"><label className="catalog-label">Name<input required name="name" defaultValue={initial?.name} onChange={(event) => !initial && setSlug(slugify(event.target.value))} className="catalog-field"/></label><label className="catalog-label">Slug<input required name="slug" value={slug} onChange={(event) => setSlug(event.target.value)} className="catalog-field font-mono"/><span className="catalog-help">Keep this stable after publishing.</span></label><label className="catalog-label sm:col-span-2">Parent<select name="parentId" defaultValue={initial?.parentId ?? ""} className="catalog-field"><option value="">No parent — top-level category</option>{categories.filter((category) => category.id !== initial?.id).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="catalog-label sm:col-span-2">Description<textarea name="description" defaultValue={initial?.description ?? ""} className="catalog-field min-h-24 resize-y"/></label><label className="catalog-label sm:col-span-2">Image URL<input name="imageUrl" defaultValue={initial?.imageUrl ?? ""} className="catalog-field"/></label><label className="catalog-label">SEO title<input name="seoTitle" defaultValue={initial?.seoTitle ?? ""} className="catalog-field"/></label><label className="catalog-label">SEO description<textarea name="seoDescription" defaultValue={initial?.seoDescription ?? ""} className="catalog-field min-h-20 resize-y"/></label></div><label className="flex min-h-11 items-center gap-3 rounded-md border border-[#d8cebf] bg-[#faf6ee] px-3 text-sm font-semibold"><input name="isActive" type="checkbox" defaultChecked={initial?.isActive ?? true} className="size-4 accent-[#D57959]"/> Active on storefront</label><FormMessage message={message}/><button disabled={pending} className="catalog-primary-button w-full">{pending ? "Saving…" : "Save category"}</button></form>;
}

export function BrandForm({ initial }: { initial?: Brand }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const editing = Boolean(initial);

  return <form className="grid gap-4 rounded-xl border border-[#cfc4b4] bg-card/95 p-5 shadow-[0_1px_2px_rgb(63_45_29/.06)] sm:p-6" action={(formData) => start(async () => { const result = await saveBrand({ id: initial?.id, name: formData.get("name"), slug: formData.get("slug"), description: formData.get("description") || undefined, logoUrl: formData.get("logoUrl") || undefined, seoTitle: formData.get("seoTitle") || undefined, seoDescription: formData.get("seoDescription") || undefined, isActive: formData.get("isActive") === "on" }); setMessage(result.message ?? ""); })}><FormHeader editing={editing} noun="brand"/><div className="grid gap-4 sm:grid-cols-2"><label className="catalog-label">Name<input required name="name" defaultValue={initial?.name} onChange={(event) => !initial && setSlug(slugify(event.target.value))} className="catalog-field"/></label><label className="catalog-label">Slug<input required name="slug" value={slug} onChange={(event) => setSlug(event.target.value)} className="catalog-field font-mono"/><span className="catalog-help">Keep this stable after publishing.</span></label><label className="catalog-label sm:col-span-2">Description<textarea name="description" defaultValue={initial?.description ?? ""} className="catalog-field min-h-24 resize-y"/></label><label className="catalog-label sm:col-span-2">Logo URL<input name="logoUrl" defaultValue={initial?.logoUrl ?? ""} className="catalog-field"/><span className="catalog-help">A valid hosted image URL; uploads are not managed here.</span></label><label className="catalog-label">SEO title<input name="seoTitle" defaultValue={initial?.seoTitle ?? ""} className="catalog-field"/></label><label className="catalog-label">SEO description<textarea name="seoDescription" defaultValue={initial?.seoDescription ?? ""} className="catalog-field min-h-20 resize-y"/></label></div><label className="flex min-h-11 items-center gap-3 rounded-md border border-[#d8cebf] bg-[#faf6ee] px-3 text-sm font-semibold"><input name="isActive" type="checkbox" defaultChecked={initial?.isActive ?? true} className="size-4 accent-[#D57959]"/> Active on storefront</label><FormMessage message={message}/><button disabled={pending} className="catalog-primary-button w-full">{pending ? "Saving…" : "Save brand"}</button></form>;
}
