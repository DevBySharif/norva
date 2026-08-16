import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const b64 = fs.readFileSync(path.join(ROOT, "scripts", "fixtures", "demo-ceramic.glb")).toString("base64");

const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.route(/node_modules\/.*/i, (route) => {
  const url = new URL(route.request().url());
  const rel = url.pathname.split("/node_modules/")[1];
  const file = path.join(ROOT, "node_modules", rel);
  const mime = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "application/octet-stream";
  if (fs.existsSync(file)) route.fulfill({ status: 200, contentType: mime, body: fs.readFileSync(file) });
  else route.fulfill({ status: 404, body: "not found" });
});
await page.goto("about:blank");

// Robust approach: build a page that imports three + the GLTFLoader as modules and parses a data URI.
await page.setContent(`
  <body>
  <script type="importmap">{"imports":{"three":"http://localhost:3000/node_modules/three/build/three.module.js"}}</script>
  <script type="module">
    import { GLTFLoader } from "http://localhost:3000/node_modules/three/examples/jsm/loaders/GLTFLoader.js";
    window.__done = false;
    const b64 = ${JSON.stringify(b64)};
    fetch("data:model/gltf-binary;base64," + b64).then(r => r.arrayBuffer()).then((arrayBuffer) => {
      const loader = new GLTFLoader();
      loader.parse(arrayBuffer, "", (gltf) => {
        const meshes = gltf.scene ? gltf.scene.children.length : 0;
        window.__result = { ok: true, children: meshes, attrs: gltf.scene?.children?.[0]?.geometry?.attributes ? Object.keys(gltf.scene.children[0].geometry.attributes) : [] };
        window.__done = true;
      }, (err) => { window.__result = { ok: false, msg: String(err?.message || err) }; window.__done = true; });
    });
  </script>
  </body>
`);
await page.waitForFunction(() => window.__done === true, { timeout: 20000 });
console.log("parse result:", JSON.stringify(await page.evaluate(() => window.__result)));
await browser.close();