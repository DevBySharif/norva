"use client";
import { createElement, useEffect, useRef, useState } from "react";
type ViewerElement = HTMLElement & { resetTurntableRotation?: () => void; cameraOrbit?: string };
export function ProductModelViewer({ src, productName }: { src: string; productName: string }) {
  const ref = useRef<ViewerElement>(null); 
  const [ready, setReady] = useState(false); 
  const [failed, setFailed] = useState(false); 
  const [rotate, setRotate] = useState(false);
  
  useEffect(() => { 
    let active = true; 
    setReady(false);
    setFailed(false);
    
    Promise.all([
      import("@google/model-viewer"), 
      fetch(src, { method: "HEAD" }).then((response) => { 
        if (!response.ok) throw new Error("MODEL_UNAVAILABLE"); 
      })
    ]).catch(() => active && setFailed(true)); 
    
    const fallbackTimer = setTimeout(() => { if (active) setReady(true); }, 2000);
    const currentRef = ref.current;
    if (currentRef) {
      const handleLoad = () => { clearTimeout(fallbackTimer); if (active) setReady(true); };
      const handleError = () => { clearTimeout(fallbackTimer); if (active) setFailed(true); };
      
      currentRef.addEventListener("load", handleLoad);
      currentRef.addEventListener("error", handleError);
      return () => { 
        active = false; 
        clearTimeout(fallbackTimer);
        currentRef.removeEventListener("load", handleLoad);
        currentRef.removeEventListener("error", handleError);
      };
    }
    
    return () => { 
      active = false; 
      clearTimeout(fallbackTimer);
    }; 
  }, [src]);

  // Use a second effect to handle the case where ref isn't immediately populated before the first effect runs
  // React 18 refs might be attached after the initial synchronous mount effect, but since this is a web component
  // it might be fine, but to be robust we bind it on ref change or via a callback ref.
  // Actually, useEffect runs after the DOM is updated, so ref.current should be available!
  
  const props = { 
    ref, 
    src, 
    alt: `Interactive 3D view of ${productName}`, 
    "camera-controls": true, 
    "touch-action": "pan-y", 
    "auto-rotate": rotate || undefined, 
    "shadow-intensity": "0.5", 
    style: { width: "100%", height: "100%", backgroundColor: "#e7e1d6", display: failed ? "none" : "block" }, 
    "data-testid": "product-model-viewer" 
  };
  
  return (
    <div className="relative aspect-square overflow-hidden border border-[#c9bdad] bg-[#e7e1d6]">
      {failed ? (
        <div role="alert" className="flex size-full items-center justify-center p-8 text-center text-muted-foreground">
          3D preview is unavailable. Product images and purchasing remain available.
        </div>
      ) : (
        <>
          {createElement("model-viewer", props)}
          {!ready && (
            <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#e7e1d6] text-muted-foreground">
              Loading 3D model…
            </div>
          )}
          <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2">
            <button type="button" className="catalog-secondary-button bg-white shadow-sm" aria-label="Reset 3D view" onClick={() => { if (ref.current) { ref.current.cameraOrbit = "auto auto auto"; ref.current.resetTurntableRotation?.(); } }}>
              Reset view
            </button>
            <button type="button" className="catalog-secondary-button bg-white shadow-sm" aria-pressed={rotate} onClick={() => setRotate((value) => !value)}>
              Auto-rotate {rotate ? "on" : "off"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
