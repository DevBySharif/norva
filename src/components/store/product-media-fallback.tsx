import { cn } from "@/lib/utils";

export function ProductMediaFallback({ name, className }: { name: string; className?: string }) {
  // Use product name length and character codes to generate deterministic variations
  const seed = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const variant = seed % 3;

  return (
    <div role="img" aria-label={`${name} — image coming soon`} className={cn("relative flex size-full min-h-[300px] items-center justify-center overflow-hidden bg-[#f0eee6] p-6 text-center group-hover:bg-[#f5f4ef] transition-colors duration-500", className)}>
      {/* Texture overlay */}
      <div className="absolute inset-0 opacity-[0.02] mix-blend-multiply" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')" }} />
      
      {/* Geometric framing based on variant */}
      {variant === 0 && (
        <>
          <div className="absolute inset-6 border border-[#c9bdad]/50" aria-hidden="true" />
          <div className="absolute left-10 top-10 size-16 rounded-full border-t border-l border-[#d57959]/60" aria-hidden="true" />
          <div className="relative size-32 rounded-full border border-[#a58d79]/40 bg-[#e7e1d6]/50 shadow-inner" />
        </>
      )}
      {variant === 1 && (
        <>
          <div className="absolute inset-x-8 inset-y-12 border-y border-[#c9bdad]/50" aria-hidden="true" />
          <div className="absolute right-8 bottom-8 size-12 border-r border-b border-[#d57959]/60" aria-hidden="true" />
          <div className="relative h-40 w-24 border border-[#a58d79]/40 bg-[#e7e1d6]/50 shadow-inner" />
        </>
      )}
      {variant === 2 && (
        <>
          <div className="absolute inset-8 border border-[#c9bdad]/40 rounded-sm" aria-hidden="true" />
          <div className="absolute left-[20%] top-[20%] size-20 rotate-12 border border-[#d57959]/30 bg-[#d57959]/5 backdrop-blur-sm" aria-hidden="true" />
          <div className="relative size-28 rotate-45 border border-[#a58d79]/40 bg-[#e7e1d6]/50 shadow-inner" />
        </>
      )}

      <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end border-t border-[#c9bdad]/30 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#8b5946]">N° 0{variant + 1}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Form Study</p>
      </div>
    </div>
  );
}