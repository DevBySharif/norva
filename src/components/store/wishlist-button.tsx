"use client";
import { useState, useTransition } from "react";
import { Heart } from "lucide-react";
import { toggleWishlist } from "@/features/wishlist/actions";
import { cn } from "@/lib/utils";
export function WishlistButton({ productId, initialSaved = false, compact = false }: { productId: string; initialSaved?: boolean; compact?: boolean }) {
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(initialSaved);
  return (
    <button
      type="button"
      className={cn("inline-flex items-center justify-center gap-1.5 rounded-[3px] border text-sm font-medium transition-colors duration-200",
        compact ? "min-h-10 px-3" : "min-h-11 px-4",
        saved ? "border-[#d57959]/60 bg-[#d57959]/10 text-[#8b5946] hover:bg-[#d57959]/15" : "border-[#bcae9d] bg-[#fffdf7]/60 text-muted-foreground hover:border-[#9f8c78] hover:text-foreground")}
      disabled={pending}
      onClick={() => start(async () => { const result = await toggleWishlist(productId); if (result.success) setSaved(Boolean(result.saved)); })}
      aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={saved}
    >
      <Heart className={cn("size-4 transition-colors duration-200", saved ? "fill-[#d57959] text-[#d57959]" : "text-muted-foreground")} aria-hidden="true" />
      {pending ? "Saving…" : saved ? "Saved" : "Save"}
    </button>
  );
}