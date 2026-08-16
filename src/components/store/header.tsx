import Link from "next/link";
import { Heart, Menu, Search, ShoppingBag, UserRound } from "lucide-react";
import { CartIndicator } from "./cart-indicator";
import { getCurrentUser } from "@/lib/auth/session";
import { getStoreSettings } from "@/features/store/settings";
import { formatCurrency } from "@/lib/utils";

const nav = [{ label: "Products", href: "/products" }, { label: "Wishlist", href: "/wishlist" }, { label: "Track order", href: "/orders/lookup" }];

export async function StoreHeader() {
  const [session, settings] = await Promise.all([getCurrentUser(), getStoreSettings()]);
  const signedIn = session?.user.role === "CUSTOMER";
  const displayName = signedIn ? (session.user.name?.split(" ")[0] ?? "Account") : null;

  return (
    <>
      {settings.freeShippingThreshold && Number(settings.freeShippingThreshold) > 0 ? (
        <p className="bg-[#8b5946] text-white">
          <span className="store-container flex min-h-9 items-center justify-center text-center text-xs font-semibold tracking-[0.05em] uppercase">
            Free shipping on orders over {formatCurrency(Number(settings.freeShippingThreshold), settings.currency)}
          </span>
        </p>
      ) : null}
      <header className="border-b border-[#d8d0c3]/70 bg-[#fbfaf9] sticky top-0 z-40 transition-colors duration-300">
        <div className="store-container flex h-16 items-center sm:h-[5rem]">
          {/* Mobile Menu */}
          <details className="group relative md:hidden mr-4">
            <summary role="button" aria-label="Open navigation" className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-[3px] transition-colors hover:bg-muted text-[#3b3530]"><Menu className="size-5" strokeWidth={1.5} aria-hidden="true" /></summary>
            <nav aria-label="Mobile navigation" className="absolute left-0 top-12 w-64 rounded-sm border border-[#d8d0c3] bg-card p-2 shadow-lg">
              {nav.map((item) => (
                <Link href={item.href} key={item.href} className="flex min-h-11 items-center rounded-sm px-4 text-[0.9375rem] font-medium text-[#3b3530] transition-colors hover:bg-[#f0eee6]">{item.label}</Link>
              ))}
              <div className="my-1 border-t border-[#d8d0c3]/50" />
              <Link href="/cart" className="flex min-h-11 items-center gap-3 rounded-sm px-4 text-[0.9375rem] font-medium text-[#3b3530] transition-colors hover:bg-[#f0eee6]"><ShoppingBag className="size-4" strokeWidth={1.5} aria-hidden="true" /> Cart</Link>
            </nav>
          </details>

          {/* Logo */}
          <Link href="/" className="mr-auto md:mr-10 shrink-0 text-[1.35rem] font-bold tracking-tight text-[#2c2825] sm:text-2xl hover:opacity-80 transition-opacity">
            NORVA<span className="text-[#d57959]">.</span>
          </Link>

          {/* Desktop Nav */}
          <nav aria-label="Primary navigation" className="hidden items-center gap-8 md:flex">
            {nav.map((item) => (
              <Link href={item.href} key={item.href} className="text-[0.9375rem] font-medium text-[#6d6054] transition-colors hover:text-[#8b5946] relative group">
                {item.label}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[#d57959] transition-all group-hover:w-full" aria-hidden="true" />
              </Link>
            ))}
          </nav>

          {/* Actions */}
          <div className="ml-auto flex items-center gap-1 sm:gap-2 text-[#3b3530]">
            <Link href="/products" aria-label="Search products" className="hidden items-center gap-2.5 rounded-full border border-[#d8d0c3] bg-white px-4 py-2 text-sm text-muted-foreground transition-all hover:border-[#a58d79] hover:shadow-sm lg:flex">
              <Search className="size-4" strokeWidth={1.5} aria-hidden="true" /> <span className="font-medium pr-2">Search</span>
            </Link>
            <Link href="/products" aria-label="Search" className="flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors hover:bg-[#f0eee6] lg:hidden"><Search className="size-5" strokeWidth={1.5} aria-hidden="true" /></Link>
            
            <div className="hidden sm:block w-px h-5 bg-[#d8d0c3]/70 mx-1" aria-hidden="true" />
            
            <Link
              href={signedIn ? "/account" : "/login"}
              aria-label={signedIn ? "My account" : "Sign in"}
              className="hidden items-center gap-2 rounded-full px-3 py-2 text-sm font-medium text-[#6d6054] transition-colors hover:bg-[#f0eee6] hover:text-[#2c2825] sm:flex"
              data-testid="account-link"
            >
              <UserRound className="size-4.5" strokeWidth={1.5} aria-hidden="true" />
              <span className="max-w-28 truncate">{displayName ?? "Sign in"}</span>
            </Link>
            <Link href={signedIn ? "/account" : "/login"} aria-label={signedIn ? "My account" : "Sign in"} className="flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors hover:bg-[#f0eee6] sm:hidden"><UserRound className="size-5" strokeWidth={1.5} aria-hidden="true" /></Link>
            
            <Link href="/wishlist" aria-label="Wishlist" className="hidden min-h-11 min-w-11 items-center justify-center rounded-full transition-colors hover:bg-[#f0eee6] sm:flex"><Heart className="size-4.5" strokeWidth={1.5} aria-hidden="true" /></Link>
            
            <Link href="/cart" aria-label="Cart" className="relative flex min-h-11 min-w-11 items-center justify-center rounded-full transition-colors hover:bg-[#f0eee6]">
              <ShoppingBag className="size-4.5" strokeWidth={1.5} aria-hidden="true" />
              <CartIndicator />
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}