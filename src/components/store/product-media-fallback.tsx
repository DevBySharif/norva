import { PackageOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export function ProductMediaFallback({ name, className }: { name: string; className?: string }) {
  return (
    <div role="img" aria-label={`${name} — image coming soon`} className={cn("relative flex size-full min-h-32 items-center justify-center overflow-hidden bg-[#e7e1d6] p-6 text-center", className)}>
      <div className="absolute inset-4 border border-[#bcae9d]/70" aria-hidden="true" />
      <div className="absolute left-8 top-8 size-10 border-l border-t border-[#d57959]/70" aria-hidden="true" />
      <div className="absolute bottom-8 right-8 size-10 border-b border-r border-[#d57959]/70" aria-hidden="true" />
      <div className="relative max-w-52">
        <div className="mx-auto grid size-14 place-items-center rounded-full border border-[#bcae9d]/60 bg-[#f0eee6]/60" aria-hidden="true">
          <PackageOpen className="size-6 text-[#8b5946]" />
        </div>
        <p className="mt-4 text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-[#66594d]">Product imagery</p>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">Coming soon</p>
      </div>
    </div>
  );
}