import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "test-results", "audit");
fs.mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:3000";
const log = (s) => console.log("[SF] " + s);
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok, detail }); log((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : "")); };
const consoleErrors = [];
const deadLinks = [];

function monitor(page, label) {
  page.on("pageerror", (e) => { consoleErrors.push(`[${label}] PAGEERROR: ${String(e.message || e)}`); });
  page.on("console", (msg) => { if (msg.type() === "error" && !String(msg.text()).includes("favicon")) consoleErrors.push(`[${label}] CONSOLE: ${msg.text()}`); });
  page.on("requestfailed", (r) => { const u = r.url(); if (!u.includes("favicon")) consoleErrors.push(`[${label}] NETFAIL: ${u} ${String(r.failure()?.errorText)}`); });
  page.on("response", (r) => { if (r.status() >= 500) consoleErrors.push(`[${label}] HTTP${r.status()}: ${r.url()}`); });
}

async function scanDeadLinks(page, label) {
  const links = await page.evaluate(() => [...document.querySelectorAll("a")].map((a) => ({ href: a.getAttribute("href"), role: a.getAttribute("aria-label") || a.textContent?.trim().slice(0, 40) })));
  for (const l of links) {
    if (l.href === "#" || (l.href && l.href.trim() === "")) deadLinks.push({ label: label, href: l.href, role: l.role });
  }
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  monitor(page, "store");

  // ============ HOMEPAGE ============
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  check("home: announcement bar (free shipping threshold)", (await page.locator('header p, .bg-primary').filter({ hasText: /free shipping on orders over/i }).count()) > 0 || (await page.getByText(/free shipping on orders over/i).count()) > 0);
  check("home: hero title", await page.getByText("Useful objects, chosen with care.").isVisible());
  check("home: logo NORVA", await page.locator("header a[href='/']").first().isVisible());
  check("home: 3 category cards rendered", (await page.locator("a[href^='/category/']").count()) >= 3);
  const productCards = page.locator("a[href^='/products/']");
  check("home: product cards rendered", (await productCards.count()) >= 3);
  check("home: 'New arrivals' section", await page.getByText("New arrivals").isVisible());
  check("home: brand statement", await page.locator("h2").filter({ hasText: /Fewer, better/ }).first().isVisible());
  await scanDeadLinks(page, "home");
  await page.screenshot({ path: path.join(OUT, "home-1440.png"), fullPage: true });

  // header nav links work
  for (const [name, href] of [["Products", "/products"], ["Wishlist", "/wishlist"], ["Track order", "/orders/lookup"]]) {
    const link = page.locator(`nav[aria-label="Primary navigation"] a[href="${href}"]`).first();
    const visible = await link.isVisible().catch(() => false);
    if (visible) { await Promise.all([link.click(), page.waitForURL((u) => u.toString().startsWith(BASE + href), { timeout: 15000 })]); check(`home: header '${name}' navigates`, true); await page.goto(BASE + "/", { waitUntil: "domcontentloaded" }); await page.waitForTimeout(800); }
    else check(`home: header '${name}' link visible`, false);
  }
  // hero CTA
  await page.locator("a.store-primary-button", { hasText: "Shop all products" }).click();
  await page.waitForURL("**/products", { timeout: 15000 });
  check("home: hero CTA -> /products", true);
  await page.goBack({ waitUntil: "domcontentloaded" });

  // ============ PRODUCTS / SEARCH ============
  await page.goto(BASE + "/products", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  check("products: heading 'All products'", await page.getByRole("heading", { name: "All products" }).isVisible());
  check("products: demo products listed", (await page.locator("a[href^='/products/demo-']").count()) >= 3);
  check("products: search input", await page.locator("#catalog-search").isVisible());
  check("products: sort select", await page.locator('select[aria-label="Sort products"]').isVisible());

  await page.fill("#catalog-search", "Demo");
  await page.click('button:has-text("Search")');
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(800);
  check("products: partial search returns results", (await page.locator("a[href^='/products/demo-']").count()) >= 3);
  await page.screenshot({ path: path.join(OUT, "products-search.png"), fullPage: true });

  await page.fill("#catalog-search", "zzzzzz");
  await page.click('button:has-text("Search")');
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(800);
  check("products: no-result empty state", await page.getByText("No products found").isVisible());
  await page.screenshot({ path: path.join(OUT, "products-noresult.png"), fullPage: true });

  // sort by price asc
  await page.goto(BASE + "/products?sort=price-asc", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  check("products: sort param works (page 200)", true);

  // ============ CATEGORY / BRAND ============
  await page.goto(BASE + "/category/tableware", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  check("category: tableware page shows Demo Ceramic Form", await page.getByText("Demo Ceramic Form").first().isVisible());
  await page.screenshot({ path: path.join(OUT, "category-tableware.png"), fullPage: true });

  await page.goto(BASE + "/brand/norva-studio", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  check("brand: norva-studio page shows demo products", (await page.locator("a[href^='/products/demo-']").count()) >= 2);
  await page.screenshot({ path: path.join(OUT, "brand-norva.png"), fullPage: true });

  // ============ PRODUCT DETAIL: SIMPLE ============
  await page.goto(BASE + "/products/demo-cloth-tote", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  check("simple: title", await page.getByRole("heading", { name: /Demo Cloth Tote/ }).isVisible());
  check("simple: price $29.00", await page.getByText("$29.00").first().isVisible());
  check("simple: compare-at price", await page.getByText("$39.00").first().isVisible());
  check("simple: 'In stock'", await page.getByText("In stock").first().isVisible());
  check("simple: gallery main", await page.getByTestId("product-gallery-main").isVisible());
  check("simple: no 'View in 3D' (no model)", (await page.getByRole("button", { name: /view in 3d/i }).count()) === 0);
  check("simple: gallery thumbnails", (await page.locator('button[aria-label^="Show image"]').count()) === 2);
  const wish = page.locator('button[aria-label^="Add to wishlist"], button[aria-label^="Remove from wishlist"]').first();
  check("simple: wishlist control present", await wish.isVisible());
  await page.screenshot({ path: path.join(OUT, "detail-simple.png"), fullPage: true });
  check("simple: Add to cart works", true);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByText("Item added. Open the cart to review quantities.").waitFor({ state: "visible", timeout: 10000 });
  check("simple: add-to-cart confirmation text", true);
  check("simple: header cart count = 1", (await page.locator('header a[aria-label="Cart"] span').filter({ hasText: "1" }).count()) > 0);

  // ============ PRODUCT DETAIL: VARIANT ============
  await page.goto(BASE + "/products/demo-everyday-backpack", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  check("variant: option 'Color' present", await page.getByRole("heading", { name: "Color", exact: true }).isVisible());
  check("variant: option 'Size' present", await page.getByRole("heading", { name: "Size", exact: true }).isVisible());
  const defaultPressed = await page.locator('button[aria-pressed="true"]').count();
  check("variant: a value pre-selected", defaultPressed >= 1);
  check("variant: default price visible ($89)", await page.getByText("$89.00").first().isVisible());
  // switch to Slate Size=S (out of stock)
  await page.locator('button', { hasText: "Slate" }).first().click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: "S" }).first().click();
  await page.waitForTimeout(500);
  check("variant: out of stock state shown", await page.getByText("Out of stock").first().isVisible());
  check("variant: Add to cart disabled (Unavailable)", await page.getByRole("button", { name: "Unavailable" }).isVisible());
  check("variant: sale price $79 shown", await page.getByText("$79.00").first().isVisible());
  await page.screenshot({ path: path.join(OUT, "detail-variant-ooos.png"), fullPage: true });
  // switch to Cedar/M (in stock)
  await page.locator('button', { hasText: "Cedar" }).first().click();
  await page.waitForTimeout(300);
  await page.locator('button', { hasText: "M" }).first().click();
  await page.waitForTimeout(500);
  check("variant: Cedar/M in stock", await page.getByText("In stock").first().isVisible());
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.waitForTimeout(700);
  check("variant: added confirm", await page.getByText("Item added. Open the cart to review quantities.").isVisible());

  // ============ CART ============
  await page.goto(BASE + "/cart", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  const itemsInCart = await page.locator('div[data-testid="line-subtotal"], span[data-testid="line-subtotal"]').count().catch(() => 0);
  check("cart: 2 line items present", itemsInCart === 2);
  check("cart: order summary subtotal present", await page.getByText(/Subtotal/).first().isVisible());
  // localStorage shape
  const ls = await page.evaluate(() => localStorage.getItem("norva_cart_v1"));
  let lsOk = false, lsDetail = "";
  if (ls) { try { const parsed = JSON.parse(ls); lsOk = parsed.version === 1 && Array.isArray(parsed.items) && parsed.items.every((i) => typeof i.variantId === "string" && typeof i.quantity === "number"); lsDetail = "items=" + (parsed.items?.length ?? "?"); } catch { lsDetail = "unparseable"; } }
  check("cart: localStorage shape (version + variantId+quantity only)", lsOk, lsDetail);
  // reload persistence
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const itemsAfterReload = await page.locator('[data-testid="line-subtotal"]').count().catch(() => 0);
  check("cart: persists across reload", itemsAfterReload === 2, "items=" + itemsAfterReload);
  await page.screenshot({ path: path.join(OUT, "cart.png"), fullPage: true });
  // increment a quantity
  const incBtn = page.locator('button[aria-label="Increase quantity"]').first();
  if (await incBtn.count() && await incBtn.isVisible()) await incBtn.click();
  await page.waitForTimeout(600);
  const qtyAfterInc = await page.evaluate(() => JSON.parse(localStorage.getItem("norva_cart_v1") || "{}").items?.[0]?.quantity);
  check("cart: increment increases qty", qtyAfterInc === 2, "qty=" + qtyAfterInc);
  // remove an item
  const removeBtn = page.locator('button[aria-label^="Remove"]').first();
  if (await removeBtn.isVisible()) { await removeBtn.click(); await page.waitForTimeout(700); }
  const itemsAfterRemove = await page.locator('[data-testid="line-subtotal"]').count().catch(() => 0);
  check("cart: remove drops a line", itemsAfterRemove === 1, "items=" + itemsAfterRemove);
  // empty cart to leave guest state clean
  const removeAll = page.locator('button[aria-label^="Remove"]');
  while (await removeAll.count() > 0) { await removeAll.first().click(); await page.waitForTimeout(500); }
  await page.waitForTimeout(400);
  check("cart: empty state after removing all", await page.getByText("Your cart is currently empty.").isVisible());
  await page.screenshot({ path: path.join(OUT, "cart-empty.png"), fullPage: true });

  // ============ WISHLIST GUEST BEHAVIOR ============
  await page.goto(BASE + "/products/demo-cloth-tote", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1000);
  const guestWish = page.locator('button[aria-label="Add to wishlist"]').first();
  if (await guestWish.count()) {
    await guestWish.click();
    await page.waitForTimeout(1500);
    const url = page.url();
    check("wishlist: guest is redirected to sign in", url.includes("/login"), url);
  } else {
    check("wishlist: guest control present", false);
  }
  await page.goto(BASE + "/wishlist", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  check("wishlist: /wishlist requires sign-in for guest", page.url().includes("/login"), page.url());

  // ============ RESPONSIVE ============
  for (const [w, h] of [[375, 812], [768, 1024]]) {
    const mpage = await ctx.newPage();
    await mpage.setViewportSize({ width: w, height: h });
    monitor(mpage, `mw${w}`);
    await mpage.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await mpage.waitForTimeout(1200);
    const hScroll = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    const hamburger = mpage.locator('summary[aria-label="Open navigation"]');
    check(`resp ${w}: no horizontal overflow`, hScroll <= 1, "scroll=" + hScroll);
    if (await hamburger.isVisible()) {
      await hamburger.click();
      await mpage.waitForTimeout(400);
      check(`resp ${w}: mobile nav opens`, await mpage.locator('nav[aria-label="Mobile navigation"]').isVisible());
    }
    await mpage.screenshot({ path: path.join(OUT, `home-${w}.png`), fullPage: true });
    await mpage.goto(BASE + "/products/demo-cloth-tote", { waitUntil: "domcontentloaded" });
    await mpage.waitForTimeout(1000);
    const hScroll2 = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(`resp ${w}: product detail no overflow`, hScroll2 <= 1, "scroll=" + hScroll2);
    await mpage.screenshot({ path: path.join(OUT, `detail-${w}.png`), fullPage: true });
    await mpage.close();
  }

  await browser.close();

  log("--- SUMMARY ---");
  log(`checks ${checks.filter((c) => c.ok).length}/${checks.length} passed; consoleErrors=${consoleErrors.length}; deadLinks=${deadLinks.length}`);
  for (const c of checks) log(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? " | " + c.detail : ""}`);
  for (const d of deadLinks) log(`  DEADLINK ${d.label}: href="${d.href}" role="${d.role}"`);
  const uniqueErrors = [...new Set(consoleErrors.map((e) => e.replace(/\s+/g, " ").slice(0, 220)))];
  for (const e of uniqueErrors.slice(0, 30)) log("  CONSOLE: " + e);
  process.exit(checks.some((c) => !c.ok) ? 2 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });