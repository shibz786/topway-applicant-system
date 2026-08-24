import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const url = process.argv[2] ?? "/login";
const outPath = process.argv[3] ?? "/tmp/screenshot.png";
const width = Number(process.argv[4] ?? 1440);
const height = Number(process.argv[5] ?? 900);
const colorScheme = process.argv[6] ?? "light"; // light | dark
const cookieHeader = process.argv[7]; // optional "name=value" session cookie

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width, height },
  colorScheme,
});
if (cookieHeader) {
  const [name, value] = cookieHeader.split("=");
  await context.addCookies([{ name, value, url: BASE }]);
}
const page = await context.newPage();
await page.goto(`${BASE}${url}`, { waitUntil: "load" });
await page.waitForTimeout(600);
await page.screenshot({ path: outPath, fullPage: false });
console.log(`Saved ${outPath}`);
await browser.close();
