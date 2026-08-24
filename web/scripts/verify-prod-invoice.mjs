// Invoice-creation smoke test against the real production deployment —
// specifically exercises invoice-number allocation (a Postgres SEQUENCE,
// see prisma/migrations/20260824030000_invoice_number_sequence), the one
// piece of this app that used to need a genuinely interactive database
// transaction. Self-cleaning: deletes the invoice it creates once it's
// confirmed working, so reruns don't leave test data behind.
// Usage: npm run verify:prod-invoice
import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";

const BASE = "https://topway-mu.vercel.app";
const marker = `PROD SMOKE TEST ${Date.now()}`;

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(`${BASE}/login`);
await page.fill("#username", "admin");
await page.fill("#password", "ChangeMe-Admin-1!");
await page.click('button[type="submit"]');
await page.waitForURL(`${BASE}/dashboard`, { timeout: 15000 }).catch(() => {});
await page.goto(`${BASE}/invoices/new`);
await page.waitForTimeout(1500);
await page.fill("#currency", "USD");
await page.fill('input[name="items.0.description"]', marker);
await page.fill('input[name="items.0.quantity"]', "1");
await page.fill('input[name="items.0.amount"]', "1");
const t0 = Date.now();
await page.getByRole("button", { name: "Create invoice" }).click();
await page
  .waitForURL(/\/invoices\/(?!new$)[a-z0-9]+$/, { timeout: 45000 })
  .catch((e) => console.log("timed out:", e.message.split("\n")[0]));
console.log("total ms:", Date.now() - t0, "final URL:", page.url());
await browser.close();

const db = new PrismaClient();
const created = await db.invoice.findFirst({ where: { items: { some: { description: marker } } } });
if (created) {
  console.log(`created invoice #${created.number} successfully — cleaning up`);
  await db.invoiceItem.deleteMany({ where: { invoiceId: created.id } });
  await db.invoice.delete({ where: { id: created.id } });
} else {
  console.log("FAILED: no invoice with the test marker was found in the database");
  process.exitCode = 1;
}
await db.$disconnect();
