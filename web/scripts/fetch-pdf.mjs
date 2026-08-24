import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const [, , username, password, url, outPath] = process.argv;

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`${BASE}/login`);
await page.fill("#username", username);
await page.fill("#password", password);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/dashboard`, { timeout: 8000 }).catch(() => {});

const res = await page.request.get(`${BASE}${url}`);
console.log("status:", res.status(), "content-type:", res.headers()["content-type"]);
const buf = await res.body();
const fs = await import("node:fs");
fs.writeFileSync(outPath, buf);
console.log(`Saved ${outPath} (${buf.length} bytes)`);
await browser.close();
