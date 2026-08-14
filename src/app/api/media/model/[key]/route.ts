import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
export async function GET(_request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params; if (key !== path.basename(key) || !key.endsWith(".glb")) return new NextResponse("Not found", { status: 404 });
  try { const bytes = await readFile(path.join(process.cwd(), ".media", "model", key)); return new NextResponse(bytes, { headers: { "Content-Type": "model/gltf-binary", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } }); } catch { return new NextResponse("Not found", { status: 404 }); }
}
