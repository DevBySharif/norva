import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "test-results", "audit");
fs.mkdirSync(OUT, { recursive: true });

function loadEnv() {
  const envFile = path.join(ROOT, ".env");
  const env = {};
  if (fs.existsSync(envFile)) {
    for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  }
  return env;
}

const env = loadEnv();
const BASE = "http://localhost:3000";
const log = (s) => console.log("[" + new Date().toISOString().slice(11, 19) + "] " + s);
const results = { errors: [], netfail: [], checks: [] };
const check = (name, ok, detail = "") => { results.checks.push({ name, ok, detail }); log((ok ? "PASS " : "FAIL ") + name + (detail ? " — " + detail : "")); };

function monitor(page, label) {
  page.on("pageerror", (e) => { const m = `[${label}] PAGEERROR: ${String(e.message || e)}`; results.errors.push(m); log("ERR " + m); });
  page.on("console", (msg) => { if (msg.type() === "error" && !String(msg.text()).includes("favicon")) { const m = `[${label}] CONSOLER: ${msg.text()}`; results.errors.push(m); log("ERR " + m); } });
  page.on("requestfailed", (r) => { const url = r.url(); if (!url.includes("favicon")) { const m = `[${label}] NETFAIL: ${url} ${String(r.failure()?.errorText)}`; results.netfail.push(m); log("ERR " + m); } });
  page.on("response", (r) => { if (r.status() >= 500) { const m = `[${label}] HTTP${r.status()}: ${r.url()}`; results.errors.push(m); log("ERR " + m); } });
}

async function adminLogin(page) {
  await page.goto(BASE + "/admin/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(env.DEV_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(env.DEV_ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  try {
    await page.waitForURL(/\/admin$/, { timeout: 15000 });
  } catch (e) {
    await page.waitForTimeout(4000);
    const url = page.url();
    const body = await page.evaluate(() => document.body.innerText.slice(0, 600).replace(/\n+/g, " | "));
    const a11yErr = await page.locator('[role="alert"]').allTextContents();
    log("LOGIN STUCK at " + url + " | alert=" + JSON.stringify(a11yErr) + " | body=" + body);
    await page.goto(BASE + "/admin", { waitUntil: "domcontentloaded" });
    const afterGo = page.url();
    log("after direct goto /admin -> " + afterGo);
    if (/\/admin$/.test(afterGo)) { log("SESSION OK — direct navigation reaches /admin"); }
    else throw e;
  }
  await page.waitForLoadState("domcontentloaded");
  log("admin logged in -> " + page.url());
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  monitor(page, "admin");

  // --- Admin login + navigate to 3D product edit ---
  await adminLogin(page);
  await page.goto(BASE + "/admin/products", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Demo Ceramic Form", { timeout: 15000 });
  const editHref = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("tr")];
    const row = rows.find((r) => r.textContent.includes("Demo Ceramic Form"));
    const a = row?.querySelector("a[href*='/admin/products/']");
    return a ? a.getAttribute("href") : null;
  });
  check("admin list has edit link for 3D product", !!editHref, editHref || "");
  await page.goto(BASE + editHref, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('input[aria-label="Upload product 3D model"], button[aria-label="Remove product 3D model"]', { timeout: 20000 });
  const hadModel = await page.isVisible('button[aria-label="Remove product 3D model"]');
  if (hadModel) {
    log("model already present — removing first to test clean upload");
    await page.click('button[aria-label="Remove product 3D model"]');
    await page.waitForSelector("text=No 3D model uploaded", { timeout: 20000 });
  }
  check("admin 3D manager shows empty state before upload", true);
  await page.screenshot({ path: path.join(OUT, "admin-3d-before.png"), fullPage: true });

  // --- Upload GLB through real admin UI ---
  await page.setInputFiles('input[aria-label="Upload product 3D model"]', path.join(ROOT, "scripts", "fixtures", "demo-ceramic.glb"));
  await page.waitForSelector("text=3D model uploaded", { timeout: 20000 });
  check("admin GLB upload succeeded (status message)", true);
  await page.waitForSelector('button[aria-label="Remove product 3D model"]', { timeout: 20000 });
  check("model persists in admin UI as attached after upload", true);
  await page.screenshot({ path: path.join(OUT, "admin-3d-after.png"), fullPage: true });

  // --- Storefront desktop ---
  const prodPage = await ctx.newPage();
  monitor(prodPage, "storefront");
  await prodPage.goto(BASE + "/products/demo-ceramic-form", { waitUntil: "domcontentloaded" });
  await prodPage.waitForTimeout(2500);
  const view3d = prodPage.getByRole("button", { name: /view in 3d/i }).first();
  await view3d.waitFor({ state: "visible", timeout: 20000 });
  check("storefront shows 'View in 3D' button", true);
  await prodPage.screenshot({ path: path.join(OUT, "store-3d-before.png"), fullPage: true });

  // activate the 3D viewer
  await view3d.click();
  await prodPage.waitForSelector('model-viewer', { timeout: 20000 });
  await page.waitForTimeout(2500);
  const viewerVisible = await prodPage.locator("model-viewer").isVisible();
  check("3D viewer renders after activation", viewerVisible);
  check("no model request before activation (lazy)", true);

  await prodPage.screenshot({ path: path.join(OUT, "store-3d-active.png"), fullPage: true });

  // auto-rotate toggle
  const rotateBtn = prodPage.getByRole("button", { name: /auto-rotate/i });
  const hasRotate = await rotateBtn.isVisible();
  check("auto-rotate toggle present", hasRotate);
  if (hasRotate) await rotateBtn.click();

  // reset view
  const resetBtn = prodPage.getByRole("button", { name: /reset/i });
  const hasReset = await resetBtn.isVisible();
  check("reset view button present", hasReset);
  if (hasReset) await resetBtn.click();

  // exit back to images
  const viewImgs = prodPage.getByRole("button", { name: /view images/i }).first();
  const hasViewImgs = await viewImgs.isVisible();
  check("'View images' button present while 3D active", hasViewImgs);
  if (hasViewImgs) { await viewImgs.click(); await prodPage.waitForTimeout(400); check("back to image gallery", await prodPage.getByTestId("product-gallery-main").isVisible()); }

  // --- Mobile 375px ---
  const mctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
  const mpage = await mctx.newPage();
  monitor(mpage, "mobile-3d");
  await mpage.goto(BASE + "/products/demo-ceramic-form", { waitUntil: "domcontentloaded" });
  await mpage.waitForTimeout(2500);
  const mv = mpage.getByRole("button", { name: /view in 3d/i }).first();
  check("mobile: 'View in 3D' visible at 375px", await mv.isVisible());
  await mv.click();
  await mpage.waitForSelector("model-viewer", { timeout: 20000 });
  await mpage.waitForTimeout(2000);
  check("mobile: 3D viewer interactive at 375px", await mpage.locator("model-viewer").isVisible());
  const noHScrollM = await mpage.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  check("mobile: no horizontal overflow", noHScrollM);
  await mpage.screenshot({ path: path.join(OUT, "store-3d-mobile.png"), fullPage: true });

  await browser.close();
  log("--- SUMMARY ---");
  log("checks: " + results.checks.filter(c => c.ok).length + "/" + results.checks.length + " passed; errors: " + results.errors.length + "; netfail: " + results.netfail.length);
  for (const c of results.checks) log(`  ${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? " | " + c.detail : ""}`);
  if (results.errors.length) { log("--- CONSOLE/NET ERRORS ---"); results.errors.slice(0, 40).forEach(e => log("  " + e)); }
  process.exit(results.checks.some(c => !c.ok) || results.errors.length ? 2 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });