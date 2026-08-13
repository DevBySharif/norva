import Link from "next/link";
const groups = [
  { title: "Shop", links: [{ label: "All products", href: "/products" }, { label: "Wishlist", href: "/wishlist" }, { label: "Cart", href: "/cart" }] },
  { title: "Account", links: [{ label: "Account overview", href: "/account" }, { label: "Orders", href: "/account/orders" }] },
  { title: "Help", links: [{ label: "Track your order", href: "/orders/lookup" }, { label: "Sign in", href: "/login" }] },
];
export function StoreFooter() { return <footer className="border-t bg-card"><div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_repeat(3,1fr)]"><div><p className="text-lg font-bold">NORVA.</p><p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">Thoughtful essentials for a slower, better everyday.</p></div>{groups.map((group) => <div key={group.title}><h2 className="text-sm font-semibold">{group.title}</h2><ul className="mt-3 space-y-2 text-sm text-muted-foreground">{group.links.map((link) => <li key={link.label}><Link href={link.href}>{link.label}</Link></li>)}</ul></div>)}</div><div className="border-t px-4 py-4 text-center text-xs text-muted-foreground">© 2026 Norva. All rights reserved.</div></footer>; }
