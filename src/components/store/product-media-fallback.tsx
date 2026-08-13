import { PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProductMediaFallback({ name, className }: { name: string; className?: string }) {
  return (
    <div role="img" aria-label={`${name} — image coming soon`} className={cn("relative flex size-full min-h-32 items-center justify-center overflow-hidden bg-[#e7e1d6] p-5 text-center", className)}>
      <div className="absolute inset-3 border border-[#bcae9d]/70" aria-hidden="true" />
      <div className="absolute left-6 top-6 size-10 border-l border-t border-[#d57959]/70" aria-hidden="true" />
      <div className="absolute bottom-6 right-6 size-10 border-b border-r border-[#d57959]/70" aria-hidden="true" />
      <div className="relative max-w-48">
        <PackageOpen className="mx-auto size-7 text-[#8b5946]" aria-hidden="true" />
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-[#66594d]">Product imagery</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">Coming soon</p>
      </div>
    </div>
  );
}
