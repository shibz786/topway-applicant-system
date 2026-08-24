import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const results = [];
function check(name, cond) {
  results.push({ name, ok: !!cond });
  console.log(`${cond ? "✅" : "❌"} ${name}`);
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("  [console error]", msg.text());
});
page.on("pageerror", (err) => console.log("  [page error]", err.message));

async function login(username, password) {
  await page.goto(`${BASE}/login`);
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/dashboard`, { timeout: 5000 }).catch(() => {});
}

async function logout() {
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL(`${BASE}/login`, { timeout: 5000 }).catch(() => {});
}

// --- 1. Admin login ---
await login("admin", "ChangeMe-Admin-1!");
check("admin lands on dashboard", page.url() === `${BASE}/dashboard`);

// --- 2. Staff nav visible for admin ---
check("Staff nav link visible for admin", await page.getByRole("link", { name: "Staff" }).isVisible());
check("Invoices nav link visible for admin", await page.getByRole("link", { name: "Invoices" }).isVisible());

// --- 3. Create a staff member with only `invoices` permission ---
await page.goto(`${BASE}/admin/staff`);
await page.getByRole("button", { name: "+ New Staff Member" }).click();
const uniq = Date.now().toString().slice(-6);
const staffUsername = `e2estaff${uniq}`;
const staffPassword = "E2eTestPass1!";
await page.fill("#name", "E2E Test Staff");
await page.fill("#username", staffUsername);
await page.fill("#email", `${staffUsername}@example.com`);
await page.fill("#password", staffPassword);
// Toggle only the "invoices" permission switch on
await page.locator("#perm-invoices").click();
await page.getByRole("button", { name: "Create" }).click();
// getByText does substring matching, and the username also appears inside
// the email cell (username@example.com) — use an exact match against the
// username's own table cell to avoid a strict-mode multi-match.
const usernameCell = page.getByRole("cell", { name: staffUsername, exact: true });
await usernameCell.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
check("new staff row appears in table", await usernameCell.isVisible().catch(() => false));

// --- 4. Log out admin, log in as new staff member ---
await logout();
await login(staffUsername, staffPassword);
check("staff (invoices perm) lands on dashboard", page.url() === `${BASE}/dashboard`);
check("Staff nav link HIDDEN for non-admin staff", !(await page.getByRole("link", { name: "Staff" }).isVisible().catch(() => false)));
check("Invoices nav link visible (has permission)", await page.getByRole("link", { name: "Invoices" }).isVisible());

// --- 5. Staff tries to hit /admin/staff directly (should bounce, not just hide nav) ---
await page.goto(`${BASE}/admin/staff`);
await page.waitForTimeout(500);
check("direct nav to /admin/staff redirects non-admin away", page.url() === `${BASE}/dashboard`);

// --- 6. Staff creates an invoice (has invoices permission) ---
await page.goto(`${BASE}/invoices/new`);
await page.fill("#currency", "USD");
await page.fill('input[name="items.0.description"]', "Test line item");
await page.fill('input[name="items.0.quantity"]', "2");
await page.fill('input[name="items.0.amount"]', "150");
await page.getByRole("button", { name: "Create invoice" }).click();
await page.waitForTimeout(1200);
const afterCreateUrl = page.url();
check("invoice created, navigated to its detail page", /\/invoices\/[a-z0-9]+$/.test(afterCreateUrl));

// --- 7. Transition status Draft -> Sent, with confirmation modal ---
await page.goto(`${BASE}/invoices`);
await page.waitForTimeout(500);
await page.getByRole("button", { name: "More" }).first().click();
await page.getByRole("menuitem", { name: /Mark as Sent/i }).click();
check("confirmation dialog appears before status change", await page.getByRole("alertdialog").isVisible());
await page.getByRole("button", { name: "Confirm" }).click();
await page.waitForTimeout(800);
check("status badge shows Sent after confirm", await page.getByText("Sent").first().isVisible());

// --- 8. Non-admin staff cannot reach bank details settings (admin-only) ---
await page.goto(`${BASE}/invoices/settings`);
await page.waitForTimeout(500);
check("non-admin redirected away from bank-details settings", page.url() === `${BASE}/invoices`);

await logout();

// --- 9. Admin sets bank details ---
await login("admin", "ChangeMe-Admin-1!");
await page.goto(`${BASE}/invoices/settings`);
await page.fill("#bankName", "Test Bank PLC");
await page.fill("#accountNo", "1234567890");
await page.getByRole("button", { name: "Save" }).click();
await page.waitForTimeout(1000);
check("bank details save shows success (no error toast)", !(await page.getByText(/something went wrong/i).isVisible().catch(() => false)));

// --- 10. Admin views the invoice PDF (permission + content sanity) ---
await page.goto(`${BASE}/invoices`);
await page.waitForTimeout(500);
const pdfResp = await page.request.get(`${BASE}/api/invoices/${afterCreateUrl.split("/").pop()}/pdf`);
check("PDF route returns 200", pdfResp.status() === 200);
check("PDF route returns application/pdf", pdfResp.headers()["content-type"] === "application/pdf");
const pdfBytes = await pdfResp.body();
check("PDF has real content (>1KB)", pdfBytes.length > 1000);

// --- 11. Unauthenticated request to the PDF route gets 401, not the file ---
const anonContext = await browser.newContext();
const anonPage = await anonContext.newPage();
const anonResp = await anonPage.request.get(`${BASE}/api/invoices/${afterCreateUrl.split("/").pop()}/pdf`);
check("unauthenticated PDF request returns 401", anonResp.status() === 401);
await anonContext.close();

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("FAILED:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
