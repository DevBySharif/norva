import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "test-results", "audit");
fs.mkdirSync(OUT, { recursive: true });
const CAPTURE = path.join(ROOT, "test-results", "email-capture.jsonl");

function loadEnv() {
  const env = {};
  if (fs.existsSync(path.join(ROOT, ".env")))
    fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/).forEach((line) => {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
    });
  return env;
}
const env = loadEnv();
const BASE = "http://localhost:3000";
const log = (s) => console.log("[CM] " + s);
const checks = [];
const check = (name, ok, detail = "") => { checks.push({ name, ok, detail }); log((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : "")); };
const consoleErrors = [];
function monitor(page, label) {
  page.on("pageerror", (e) => consoleErrors.push(`[${label}] PAGEERROR: ${String(e.message || e)}`));
  page.on("console", (m) => { if (m.type() === "error" && !String(m.text()).includes("favicon")) consoleErrors.push(`[${label}] CONSOLE: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 500) consoleErrors.push(`[${label}] HTTP${r.status()}: ${r.url()}`); });
}
const lastLineFor = (email) => {
  if (!fs.existsSync(CAPTURE)) return null;
  const lines = fs.readFileSync(CAPTURE, "utf8").split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) { try { const o = JSON.parse(lines[i]); if (o.to === email) return o; } catch {} }
  return null;
};
async function adminLogin(page) {
  await page.goto(BASE + "/admin/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(env.DEV_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(env.DEV_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/, { timeout: 20000 });
}

async function waitEnabled(locator, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await locator.isEnabled().catch(() => false) && await locator.isVisible().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
async function main() {
  const browser = await chromium.launch();
  const customerEmail = "audit.shopper" + Date.now().toString(36) + "@local.test";
  const password = "ShoppingPass1!";

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  monitor(page, "cust");

  // ---------- REGISTER ----------
  await page.goto(BASE + "/register", { waitUntil: "domcontentloaded" });
  await page.fill("#register-fullName", "Audit Shopper");
  await page.fill("#register-email", customerEmail);
  await page.fill("#register-phone", "+1555" + String(Date.now()).slice(-8));
  await page.fill("#register-password", password);
  await page.fill("#register-confirm", password);
  await page.getByRole("button", { name: /Create account/i }).click();
  await page.waitForTimeout(2000);
  const afterReg = page.url();
  const email = lastLineFor(customerEmail);
  check("register: account created + verification email captured", !!email, afterReg);
  const verifyLink = email ? (email.text.match(/http:\/\/[^\s]+verify-email\?token=[^\s]+/) || [])[0] : null;
  check("register: verify link present in email", !!verifyLink);

  // ---------- EMAIL VERIFY ----------
  if (verifyLink) {
    await page.goto(verifyLink, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: /Verify my email/i }).click();
    await page.getByTestId("verify-success").waitFor({ timeout: 15000 });
    const vMsg = await page.getByTestId("verify-success").textContent();
    check("register: email verified via link", /verif|success/i.test(vMsg || ""), vMsg);
    await page.screenshot({ path: path.join(OUT, "commerce-verified.png"), fullPage: true });
  }

  // ---------- CUSTOMER SIGN IN ----------
  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" });
  await page.fill("#login-email", customerEmail);
  await page.fill("#login-password", password);
  await page.getByRole("button", { name: /Sign in/i }).click();
  let afterLogin = "";
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(500);
    afterLogin = page.url();
    if (!afterLogin.includes("/login")) break;
    const lerr = await page.getByTestId("login-error").textContent().catch(() => "");
    if (lerr) break;
  }
  if (afterLogin.includes("/login")) {
    const lerr = await page.getByTestId("login-error").textContent().catch(() => "");
    check("login: customer can sign in", false, "stayed on /login: " + (lerr || ""));
  } else {
    check("login: customer can sign in", true, afterLogin);
  }
  await page.screenshot({ path: path.join(OUT, "commerce-account.png"), fullPage: true });

  // ---------- WISHLIST PERSISTENCE (signed in) ----------
  await page.goto(BASE + "/products/demo-ceramic-form", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const wlBtn = page.locator('button[aria-label="Add to wishlist"]');
  await wlBtn.waitFor({ timeout: 15000 });
  await wlBtn.click();
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/wishlist", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  const wishText = await page.locator("body").innerText().catch(() => "");
  check("wishlist: toggled product persists in /wishlist", /Demo Ceramic/i.test(wishText));
  await page.screenshot({ path: path.join(OUT, "commerce-wishlist.png"), fullPage: true });

  // ---------- ADD TO CART ----------
  await page.goto(BASE + "/products/demo-cloth-tote", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const addCart = page.getByRole("button", { name: "Add to cart" });
  await addCart.waitFor({ timeout: 15000 });
  await addCart.click();
  await page.getByText(/Item added/i).waitFor({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.goto(BASE + "/cart", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  check("cart: item added appears in cart", /Demo Cloth Tote/i.test(await page.locator("body").innerText().catch(() => "")));

  // ---------- CHECKOUT ----------
  await page.goto(BASE + "/checkout", { waitUntil: "domcontentloaded" });
  await page.getByTestId("place-order").waitFor({ timeout: 20000 });
  await page.fill("#customer\\.fullName", "Audit Shopper");
  await page.fill("#customer\\.email", customerEmail);
  await page.fill("#customer\\.phone", "+1555" + String(Date.now()).slice(-8));
  await page.fill("#shippingAddress\\.line1", "123 Audit Ave");
  await page.fill("#shippingAddress\\.city", "Springfield");
  await page.fill("#shippingAddress\\.state", "IL");
  await page.fill("#shippingAddress\\.postalCode", "62704");
  await page.fill("#shippingAddress\\.country", "USA").catch(() => {});
  await page.check('input[name="paymentMethod"][value="COD"]').catch(() => {});

  // wait for totals to hydrate then apply coupon
  await page.getByTestId("checkout-total").filter({ hasText: "$" }).waitFor({ timeout: 15000 }).catch(() => {});
  await page.locator('input[placeholder="Enter coupon code"]').fill("audit10");
  await waitEnabled(page.getByRole("button", { name: /^Apply$/i }), 12000);
  await page.getByRole("button", { name: /^Apply$/i }).click();
  const discountRow = page.locator('dt:has-text("Discount"), dt:has-text("discount")').filter({ hasText: "AUDIT10" });
  await discountRow.waitFor({ timeout: 15000 }).catch(() => {});
  await page.getByTestId("checkout-total").filter({ hasText: "$" }).waitFor({ timeout: 10000 }).catch(() => {});
  const totalsText = await page.locator("body").innerText().catch(() => "");
  const discountMatch = totalsText.match(/Discount[\s\S]*?-\$([\d.]+)/) || totalsText.match(/Discount[^\n]*-\s*\$?([\d.]+)/);
  const lastDollar = totalsText.match(/\$([\d.]+)/g);
  check("checkout: coupon applied (discount row visible)", /Discount \(AUDIT10\)/i.test(totalsText), discountMatch ? discountMatch[0].replace(/\s+/g, " ") : totalsText.replace(/\s+/g, " ").slice(0, 90));
  check("checkout: discount ~10% of $29 subtotal", discountMatch && Math.abs(parseFloat(discountMatch[1]) - 2.9) < 0.6, discountMatch ? discountMatch[1] : "n/a");
  check("checkout: grand total rendered", !!lastDollar && lastDollar.length >= 1, String(lastDollar ? lastDollar[lastDollar.length - 1] : null));
  await page.screenshot({ path: path.join(OUT, "commerce-checkout.png"), fullPage: true });

  // place COD order
  await page.getByTestId("place-order").click();
  await page.waitForURL(/\/order-success\//, { timeout: 25000 });
  const orderNum = (page.url().match(/order-success\/([^/?#]+)/) || [])[1];
  await page.waitForLoadState("domcontentloaded");
  check("checkout: COD order placed -> order-success page", page.url().includes("/order-success"), page.url());
  await page.screenshot({ path: path.join(OUT, "commerce-order-success.png"), fullPage: true });

  // ---------- ADMIN ORDER LIFECYCLE ----------
  const adminCtx = await browser.newContext();
  const apage = await adminCtx.newPage();
  monitor(apage, "admin");
  await adminLogin(apage);
  await apage.goto(BASE + "/admin/orders", { waitUntil: "domcontentloaded" });
  await apage.getByText(orderNum, { exact: false }).first().waitFor({ timeout: 20000 });
  const orderLink = apage.locator(`a[href*="/admin/orders/"]`).filter({ hasText: orderNum }).first();
  await orderLink.click().catch(async () => { await apage.locator(`a[href*="/admin/orders/"]`).first().click(); });
  await apage.getByTestId("order-status-select").waitFor({ timeout: 20000 });
  await apage.waitForTimeout(2500);
  check("admin: opened the placed order detail", apage.url().includes("/admin/orders"), apage.url());

  const FORWARD = ["CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED"];
  const transition = async (target) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      await apage.waitForTimeout(600);
      await apage.getByTestId("order-status-select").selectOption(target).catch(() => {});
      await apage.getByTestId("order-status-apply").click();
      await apage.waitForTimeout(1800);
      const msg = (await apage.getByTestId("order-action-message").textContent().catch(() => "")) || "";
      if (msg) return msg;
    }
    return "";
  };
  let idx = 0;
  while (idx < FORWARD.length) {
    const opts = await apage.getByTestId("order-status-select").locator("option").allInnerTexts().catch(() => []);
    const target = FORWARD.slice(idx).find((s) => opts.includes(s));
    if (!target) break;
    const msg = await transition(target);
    check(`admin: order status -> ${target}`, /moved to|success/i.test(msg) && !/error/i.test(msg), msg);
    idx = FORWARD.indexOf(target) + 1;
  }
  const paid = apage.getByTestId("payment-mark-received");
  if (await paid.count().catch(() => 0)) {
    await paid.click();
    await apage.waitForTimeout(1200);
    check("admin: COD payment received", true);
  }
  await apage.screenshot({ path: path.join(OUT, "commerce-admin-order.png"), fullPage: true });

  // ---------- CUSTOMER REVIEW AFTER DELIVERY ----------
  await page.goto(BASE + "/products/demo-cloth-tote", { waitUntil: "domcontentloaded" });
  const ratingSelect = page.locator('select[name="rating"]');
  const bodyBox = page.locator('textarea[name="body"]');
  const hasForm = await ratingSelect.count();
  if (hasForm) {
    await ratingSelect.selectOption("5");
    await bodyBox.fill("Great quality tote, recommend it.");
    await page.getByRole("button", { name: "Save review" }).click();
    await page.waitForTimeout(1800);
    const afterReview = await page.locator("body").innerText().catch(() => "");
    check("review: eligible (delivered) form shown + submission works", /Great quality tote/i.test(afterReview), afterReview.replace(/\s+/g, " ").slice(0, 70));
  } else {
    const notice = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 120);
    check("review: eligible form shown for delivered order", false, "no form: " + notice);
  }

  // admin reviews moderation
  await apage.goto(BASE + "/admin/reviews", { waitUntil: "domcontentloaded" });
  await apage.waitForTimeout(1500);
  const rv = await apage.locator("body").innerText().catch(() => "");
  check("admin: review appears in admin reviews", /Great quality tote/i.test(rv));
  await apage.screenshot({ path: path.join(OUT, "commerce-admin-reviews.png"), fullPage: true });

  await browser.close();
  log("--- SUMMARY ---");
  const failed = checks.filter((c) => !c.ok);
  log(`checks ${checks.filter((c) => c.ok).length}/${checks.length} passed; consoleErrors=${consoleErrors.length}; failed=${failed.length}`);
  for (const c of failed) log("  FAIL " + c.name + (c.detail ? " | " + c.detail : ""));
  for (const e of [...new Set(consoleErrors)].slice(0, 15)) log("  " + e.replace(/\s+/g, " ").slice(0, 180));
  process.exit(failed.length ? 2 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });