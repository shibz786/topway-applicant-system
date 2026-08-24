// Concurrent-login smoke test against the real production deployment —
// specifically checks for Postgres connection-pool exhaustion under real
// simultaneous traffic, which a single sequential login can't catch (see
// the datasource block comment in prisma/schema.prisma for the actual
// incident this exists because of). Usage: npm run verify:prod-login
import { chromium } from "playwright";
const BASE = "https://topway-mu.vercel.app";
const RUNS = 5;

async function attempt(i) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const t0 = Date.now();
  await page.goto(`${BASE}/login`);
  await page.fill("#username", "admin");
  await page.fill("#password", "ChangeMe-Admin-1!");
  const [resp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/auth/login")),
    page.click('button[type="submit"]'),
  ]);
  console.log(`run ${i}: login status ${resp.status()} in ${Date.now() - t0}ms`);
  await browser.close();
}

// Fire them concurrently to actually stress the connection pool the way
// real simultaneous users would, not one at a time.
await Promise.all(Array.from({ length: RUNS }, (_, i) => attempt(i + 1)));
