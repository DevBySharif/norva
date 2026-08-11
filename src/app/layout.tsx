import type { Metadata } from "next"; import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = { metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"), title: { default: "Norva — Everyday essentials", template: "%s | Norva" }, description: "Thoughtful essentials for a slower, better everyday.", openGraph: { type: "website", siteName: "Norva" }, twitter: { card: "summary_large_image" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><Providers>{children}</Providers></body></html>; }
