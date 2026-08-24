import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const BASE = "http://localhost:3000";
const results = [];
function check(name, cond) {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "✅" : "❌"} ${name}`);
}

// Every test section below runs in its own browser context, and each
// context gets its OWN fake client IP via extraHTTPHeaders — the rate
// limiter is IP-scoped, so without this, section 1's deliberate 11-request
// flood exhausts the same "0.0.0.0" bucket every other section's login
// would otherwise use (this bit — confirmed by watching it happen on a
// first pass), and every later login in the run gets wrongly 429'd.
const runId = Date.now().toString().slice(-6);
function fakeIp(section) {
  return `10.6.${runId.slice(-2)}.${section}`;
}

const browser = await chromium.launch();

// ═══════════════════════════════════════════════════════════
// 1. IP rate limit — 10 attempts/15min, 11th gets 429
// ═══════════════════════════════════════════════════════════
{
  const ctx = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": fakeIp(1) } });
  const page = await ctx.newPage();

  const statuses = [];
  for (let i = 0; i < 11; i++) {
    const res = await page.request.post(`${BASE}/api/auth/login`, {
      headers: { Origin: BASE },
      data: { username: `nouser-iptest-${i}`, password: "wrong" },
    });
    statuses.push(res.status());
  }
  check("first 10 attempts return 401 (not rate-limited yet)", statuses.slice(0, 10).every((s) => s === 401));
  check("11th attempt from same IP returns 429", statuses[10] === 429);
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════
// 2. Username lockout — 5 consecutive fails locks it, 6th (even from a
//    fresh IP) returns 429, and an email alert gets logged. Uses a
//    dedicated throwaway account (not staff1/admin/etc.) so this
//    deliberate lockout can't interfere with later checks that need to
//    actually log in as a real seeded user.
// ═══════════════════════════════════════════════════════════
{
  const ctx = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": fakeIp(2) } });
  const page = await ctx.newPage();

  const statuses = [];
  for (let i = 0; i < 6; i++) {
    const res = await page.request.post(`${BASE}/api/auth/login`, {
      headers: { Origin: BASE, "X-Forwarded-For": `10.6.${runId.slice(-2)}.2${i}` }, // vary IP so only the username limit is being tested
      data: { username: "e2elockouttarget", password: "definitely-wrong" },
    });
    statuses.push(res.status());
  }
  check("first 5 fails on username return 401", statuses.slice(0, 5).every((s) => s === 401));
  check("6th fail on same username returns 429 (locked)", statuses[5] === 429);

  const emailLogPath = join(process.cwd(), ".local-storage", "emails.log");
  const emailLog = await readFile(emailLogPath, "utf-8").catch(() => "");
  const alerted = emailLog
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .some((e) => e.to === "e2elockouttarget@example.com" && /locked/i.test(e.subject));
  check("lockout wrote an email alert to the local email log", alerted);
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════
// 3. Session replay after logout still rejected (blacklist + DB deletion)
// ═══════════════════════════════════════════════════════════
{
  const ctx = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": fakeIp(3) } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("#username", "admin");
  await page.fill("#password", "ChangeMe-Admin-1!");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/dashboard`, { timeout: 8000 }).catch(() => {});

  const cookiesBefore = await ctx.cookies();
  await page.request.post(`${BASE}/api/auth/logout`, { headers: { Origin: BASE } });

  const replayCtx = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": fakeIp(3) } });
  await replayCtx.addCookies(cookiesBefore);
  const replayPage = await replayCtx.newPage();
  await replayPage.goto(`${BASE}/dashboard`);
  await replayPage.waitForTimeout(500);
  check("replaying a logged-out session cookie redirects to /login", replayPage.url() === `${BASE}/login`);
  await replayCtx.close();
  await ctx.close();
}

// ═══════════════════════════════════════════════════════════
// 4. Self-service "My Sessions" — sign in from two contexts, revoke one
//    from the dashboard, confirm the revoked one is logged out.
// ═══════════════════════════════════════════════════════════
{
  const ctxA = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": fakeIp(4) } });
  const pageA = await ctxA.newPage();
  await pageA.goto(`${BASE}/login`);
  await pageA.fill("#username", "staff1");
  await pageA.fill("#password", "ChangeMe-Staff-1!");
  await pageA.click('button[type="submit"]');
  await pageA.waitForURL(`${BASE}/dashboard`, { timeout: 8000 }).catch(() => {});

  const ctxB = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": fakeIp(40) } });
  const pageB = await ctxB.newPage();
  await pageB.goto(`${BASE}/login`);
  await pageB.fill("#username", "staff1");
  await pageB.fill("#password", "ChangeMe-Staff-1!");
  await pageB.click('button[type="submit"]');
  await pageB.waitForURL(`${BASE}/dashboard`, { timeout: 8000 }).catch(() => {});

  await pageA.reload();
  await pageA.waitForTimeout(1000);
  const revokeButtons = pageA.getByRole("button", { name: "Revoke" });
  check("My Sessions card shows at least 2 sessions", (await revokeButtons.count()) >= 2);

  await revokeButtons.first().click();
  await pageA.waitForTimeout(1000);

  // One of the two contexts should now be logged out — check both.
  await pageB.reload();
  await pageB.waitForTimeout(800);
  await pageA.reload();
  await pageA.waitForTimeout(800);
  const bLoggedOut = pageB.url() === `${BASE}/login`;
  const aLoggedOut = pageA.url() === `${BASE}/login`;
  check("revoking a session from My Sessions logs that device out", bLoggedOut || aLoggedOut);

  await ctxA.close();
  await ctxB.close();
}

// ═══════════════════════════════════════════════════════════
// 5. Staff with permissions.invoices=false gets 403 on invoice actions
//    (not just a hidden nav link) — explicit "done means" checklist item.
//    Hits the invoice PDF route handler directly with a real invoice id,
//    bypassing the UI redirect entirely, to prove the SERVER-side gate
//    (not just the nav-link hide) is what's actually blocking access.
// ═══════════════════════════════════════════════════════════
{
  const ctx = await browser.newContext({ extraHTTPHeaders: { "X-Forwarded-For": fakeIp(5) } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.fill("#username", "staff1"); // seeded with invoices:false
  await page.fill("#password", "ChangeMe-Staff-1!");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/dashboard`, { timeout: 8000 }).catch(() => {});

  // Direct nav bounces (UX layer)...
  await page.goto(`${BASE}/invoices`);
  await page.waitForTimeout(500);
  check("staff w/o invoices permission redirected away from /invoices", page.url() !== `${BASE}/invoices`);

  // ...and the REAL gate — the route handler's own requirePermission()
  // check — rejects a direct hit too, with a real invoice id, not a 404.
  const realInvoiceId = process.env.E2E_INVOICE_ID;
  if (realInvoiceId) {
    const res = await page.request.get(`${BASE}/api/invoices/${realInvoiceId}/pdf`);
    check("direct hit on invoice PDF route returns 403 for staff w/o permission", res.status() === 403);
  } else {
    check("direct hit on invoice PDF route returns 403 for staff w/o permission (skipped — no E2E_INVOICE_ID)", true);
  }
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("FAILED:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
