import Link from "next/link"; import { Heart, Menu, Search, ShoppingBag, UserRound } from "lucide-react";
import { CartIndicator } from "./cart-indicator";
import { getCurrentUser } from "@/lib/auth/session";
const nav = ["New arrivals", "Shop", "Collections", "Journal"];

export async function StoreHeader() {
  const session = await getCurrentUser();
  const signedIn = !!session?.user;
  const displayName = signedIn ? (session.user.name?.split(" ")[0] ?? "Account") : null;

  return (
    <>
      <div className="bg-primary px-4 py-2 text-center text-xs font-medium text-primary-foreground">Complimentary shipping on orders over $75</div>
      <header className="border-b bg-background">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
          <details className="group relative md:hidden">
            <summary role="button" aria-label="Open navigation" className="flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-md"><Menu className="size-5" /></summary>
            <nav aria-label="Mobile navigation" className="absolute left-0 top-12 z-50 w-56 rounded-lg border bg-card p-2 shadow-lg">
              {nav.map((item) => <Link href="/#" key={item} className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-muted">{item}</Link>)}
              <Link href="/wishlist" className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium hover:bg-muted">Wishlist</Link>
            </nav>
          </details>
          <Link href="/" className="mr-4 text-lg font-bold tracking-tight">NORVA<span className="text-muted-foreground">.</span></Link>
          <nav aria-label="Primary navigation" className="hidden gap-6 text-sm font-medium md:flex">
            {nav.map((item) => <Link href="/#" key={item} className="hover:text-muted-foreground">{item}</Link>)}
          </nav>
          <button aria-label="Search products" className="ml-auto hidden items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground sm:flex"><Search className="size-4" /> Search the collection</button>
          <div className="flex items-center gap-3">
            <button aria-label="Search" className="sm:hidden"><Search className="size-5" /></button>
            <Link
              href={signedIn ? "/account" : "/login"}
              aria-label={signedIn ? "My account" : "Sign in"}
              className="hidden items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground sm:flex"
              data-testid="account-link"
            >
              <UserRound className="size-5" />
              {displayName ?? "Sign in"}
            </Link>
            <Link href="/account" aria-label="My account" className="sm:hidden"><UserRound className="size-5" /></Link>
            <Link href="/wishlist" aria-label="Wishlist" className="hidden sm:block"><Heart className="size-5" /></Link>
            <Link href="/cart" aria-label="Cart" className="relative"><ShoppingBag className="size-5" /><CartIndicator /></Link>
          </div>
        </div>
      </header>
    </>
  );
}
