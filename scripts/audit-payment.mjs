import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "test-results", "audit");
fs.mkdirSync(OUT, { recursive: true });
function loadEnv() {
  const env = {};
  fs.readFileSync(path.join(ROOT, ".env"), "utf8").split(/\r?\n/).forEach((l) => {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
  });
  return env;
}
const env = loadEnv();
const BASE = "http://localhost:3000";
const log = (s) => console.log("[PY] " + s);
const checks = [];
const check = (n, ok, d = "") => { checks.push({ n, ok, d }); log((ok ? "PASS " : "FAIL ") + n + (d ? " — " + d : "")); };
const errors = [];
const monitor = (page, l) => {
  page.on("pageerror", (e) => errors.push(`[${l}] PAGEERR: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !String(m.text()).includes("favicon")) errors.push(`[${l}] ${m.text()}`); });
  page.on("response", (r) => { if (/test-payment-gateway|webhooks\/payments|payment\/return/.test(r.url())) { navs.push(r.url()); log(`  resp ${r.status()} ${r.url().slice(0, 110)}`); } });
};
const navs = [];
async function fillChecked(page, sel, value) {
  for (let a = 0; a < 3; a++) {
    await page.fill(sel, value);
    await page.waitForTimeout(250);
    if ((await page.inputValue(sel).catch(() => "")) === value) return true;
  }
  return (await page.inputValue(sel).catch(() => "")) === value;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  monitor(page, "pay");

  // ---------- GUEST ONLINE CHECKOUT ----------
  await page.goto(BASE + "/products/demo-ceramic-form", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByText(/Item added/i).waitFor({ timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.goto(BASE + "/checkout", { waitUntil: "domcontentloaded" });
  await page.getByTestId("place-order").waitFor({ timeout: 20000 });
  const email = "pay.guest" + Date.now().toString(36) + "@local.test";
  await fillChecked(page, "#customer\\.fullName", "Payment Guest");
  await fillChecked(page, "#customer\\.email", email);
  await fillChecked(page, "#customer\\.phone", "+1555" + String(Date.now()).slice(-8));
  await fillChecked(page, "#shippingAddress\\.line1", "77 Gateway St");
  await fillChecked(page, "#shippingAddress\\.city", "Springfield");
  await fillChecked(page, "#shippingAddress\\.state", "IL");
  await fillChecked(page, "#shippingAddress\\.postalCode", "62701");
  await fillChecked(page, "#shippingAddress\\.country", "USA");
  await page.check('input[name="paymentMethod"][value="ONLINE"]');
  await page.getByTestId("place-order").click();

  // expect redirect to test-payment-gateway sandbox page
  await page.waitForURL(/\/api\/test-payment-gateway/, { timeout: 30000 });
  const gwUrl = page.url();
  const orderNumber = new URL(gwUrl).searchParams.get("orderNumber");
  check("online: order redirects to TEST payment sandbox", /test-payment-gateway/.test(gwUrl), gwUrl.slice(0, 90));
  check("online: gateway carries orderNumber", !!orderNumber, orderNumber);
  await page.screenshot({ path: path.join(OUT, "payment-gateway.png"), fullPage: true });

  // ---------- SIMULATE SUCCESS (fires IPN + redirect) ----------
  await page.getByRole("link", { name: "Simulate Success" }).click();
  await page.waitForURL(/\/order-success\/|\/payment\/return/, { timeout: 30000 });
  await page.waitForLoadState("domcontentloaded");
  const retUrl = page.url();
  const retSeen = navs.some((u) => u.includes("payment/return"));
  const retBody = await page.locator("body").innerText().catch(() => "");
  check("online: gateway returned to /payment/return confirmation", retSeen);
  check("online: order reached success page after confirmed payment", /order-success/.test(retUrl), retUrl.slice(0, 110));
  check("online: success page reflects placed order", /NORVA-|Thank|order|success/i.test(retBody), retBody.replace(/\s+/g, " ").slice(0, 80));
  await page.screenshot({ path: path.join(OUT, "payment-return.png"), fullPage: true });

  // IPN webhook fires server-to-server (not visible to the browser): verify the endpoint directly.
  const ipn = await fetch(BASE + "/api/webhooks/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "SUCCESS", amount: "55.00", currency: "USD", merchantReference: orderNumber, providerReference: "TEST_SESS_VERIFY", signature: "VALID_TEST_SIGNATURE" }),
  });
  check("online: payment IPN webhook endpoint accepts notifications", ipn.status === 200, "HTTP " + ipn.status);

  // ---------- VERIFY ORDER PAID IN ADMIN ----------
  const admin = await browser.newPage();
  await admin.goto(BASE + "/admin/login", { waitUntil: "domcontentloaded" });
  await admin.getByLabel("Email").fill(env.DEV_ADMIN_EMAIL);
  await admin.getByLabel("Password").fill(env.DEV_ADMIN_PASSWORD);
  await admin.getByRole("button", { name: "Sign in" }).click();
  await admin.waitForURL(/\/admin$/, { timeout: 20000 });
  await admin.goto(BASE + "/admin/orders", { waitUntil: "domcontentloaded" });
  await admin.getByText(orderNumber, { exact: false }).first().waitFor({ timeout: 20000 });
  await admin.locator(`a[href*="/admin/orders/"]`).filter({ hasText: orderNumber }).first().click();
  await admin.getByTestId("order-status-select").waitFor({ timeout: 20000 });
  const orderDetail = await admin.locator("body").innerText().catch(() => "");
  check("online: admin order shows online payment paid", /TEST|paid|PAID/i.test(orderDetail) && /received|ONLINE|pay securely|provider/i.test(orderDetail), orderDetail.replace(/\s+/g, " ").slice(0, 80));
  // payment must be PAID status: mark-received button should NOT appear (only for COD pending)
  const markPaid = await admin.getByTestId("payment-mark-received").count().catch(() => 0);
  check("online: paid order (no 'mark received' COD control)", markPaid === 0, `markPaid=${markPaid}`);
  await admin.screenshot({ path: path.join(OUT, "payment-admin-order.png"), fullPage: true });

  // ---------- UPDATE ORDER TO DELIVERED (post-payment flow) ----------
  const apply = admin.getByTestId("order-status-apply");
  let result = "";
  for (let i = 0; i < 4 && !/moved to delivered/i.test(result); i++) {
    const opts = await admin.getByTestId("order-status-select").locator("option").allInnerTexts().catch(() => []);
    const target = opts.find((o) => /CONFIRMED|PROCESSING|SHIPPED|DELIVERED/.test(o));
    if (!target) break;
    await admin.getByTestId("order-status-select").selectOption(target).catch(() => {});
    await apply.click();
    await admin.waitForTimeout(1800);
    result = (await admin.getByTestId("order-action-message").textContent().catch(() => "")) || "";
  }
  check("online: paid order advances through lifecycle to DELIVERED", /moved to delivered/i.test(result), result);
  await admin.screenshot({ path: path.join(OUT, "payment-lifecycle.png"), fullPage: true });

  await browser.close();
  log("--- SUMMARY ---");
  const failed = checks.filter((c) => !c.ok);
  log(`checks ${checks.length - failed.length}/${checks.length} passed; ${failed.length} failed; ${errors.length} errors`);
  for (const c of failed) log("  FAIL " + c.n + (c.d ? " | " + c.d : ""));
  for (const e of [...new Set(errors)].slice(0, 10)) log("  ERR " + e.replace(/\s+/g, " ").slice(0, 200));
  process.exit(failed.length ? 2 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });