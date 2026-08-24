import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const [, , username, password, url, outPath, widthArg, heightArg, colorScheme] = process.argv;
const width = Number(widthArg ?? 1440);
const height = Number(heightArg ?? 900);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width, height }, colorScheme: colorScheme ?? "light" });
const page = await context.newPage();

await page.goto(`${BASE}/login`);
await page.fill("#username", username);
await page.fill("#password", password);
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/dashboard`, { timeout: 8000 }).catch(() => {});

await page.goto(`${BASE}${url}`, { waitUntil: "load" });
await page.waitForTimeout(700);
await page.screenshot({ path: outPath });
console.log(`Saved ${outPath}`);
await browser.close();
