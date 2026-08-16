import Link from "next/link";
const groups = [
  { title: "Shop", links: [{ label: "All products", href: "/products" }, { label: "Wishlist", href: "/wishlist" }, { label: "Cart", href: "/cart" }] },
  { title: "Account", links: [{ label: "Account overview", href: "/account" }, { label: "Orders", href: "/account/orders" }] },
  { title: "Help", links: [{ label: "Track your order", href: "/orders/lookup" }, { label: "Sign in", href: "/login" }] },
];
export function StoreFooter() {
  return (
    <footer className="border-t border-[#d8d0c3]/70 bg-[#fbfaf9]">
      <div className="store-container grid grid-cols-1 gap-10 py-12 sm:grid-cols-2 sm:gap-12 lg:grid-cols-[2fr_repeat(3,1fr)] lg:gap-8 lg:py-20">
        <div className="sm:col-span-2 lg:col-span-1 lg:pr-10">
          <p className="text-[1.35rem] font-bold tracking-tight text-[#2c2825]">NORVA<span className="text-[#d57959]">.</span></p>
          <p className="mt-4 max-w-sm text-[0.9375rem] leading-relaxed text-[#6d6054]">Thoughtful essentials for a slower, better everyday — a small catalog chosen with care.</p>
        </div>
        {groups.map((group) => (
          <div key={group.title}>
            <h2 className="text-[0.6875rem] font-bold uppercase tracking-[0.15em] text-[#8b5946] mb-5">{group.title}</h2>
            <ul className="space-y-3.5 text-[0.9375rem]">
              {group.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="font-medium text-[#6d6054] transition-colors hover:text-[#2c2825]">{link.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-[#d8d0c3]/50">
        <div className="store-container py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs font-medium text-[#a58d79]">© {new Date().getFullYear()} Norva. All rights reserved.</p>
          <div className="flex gap-4">
            <span className="text-xs font-medium text-[#a58d79] hover:text-[#6d6054] cursor-pointer transition-colors">Privacy</span>
            <span className="text-xs font-medium text-[#a58d79] hover:text-[#6d6054] cursor-pointer transition-colors">Terms</span>
          </div>
        </div>
      </div>
    </footer>
  );
}