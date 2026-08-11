"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const items = [
  { href: "/account", label: "Overview" },
  { href: "/account/orders", label: "Orders" },
  { href: "/account/profile", label: "Profile" },
  { href: "/account/addresses", label: "Addresses" },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="flex flex-wrap gap-2 border-b border-[#d8d0c3] pb-4">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== "/account" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              active ? "bg-[#D57959] text-white" : "bg-[#F0EEE6]/60 text-gray-700 hover:bg-[#e8e2d9]"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
