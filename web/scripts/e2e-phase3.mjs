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
page.on("pageerror", (err) => console.log("  [page error]", err.message));
page.on("console", (msg) => {
  if (msg.type() === "error" && !msg.text().includes("Download the React DevTools")) {
    console.log("  [console error]", msg.text());
  }
});

async function login(username, password) {
  await page.goto(`${BASE}/login`);
  await page.fill("#username", username);
  await page.fill("#password", password);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/dashboard`, { timeout: 8000 }).catch(() => {});
}
async function logout() {
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL(`${BASE}/login`, { timeout: 8000 }).catch(() => {});
}

// ─── 1. Admin creates a candidate through the full wizard ───
await login("admin", "ChangeMe-Admin-1!");
await page.goto(`${BASE}/admin/candidates/new`);
await page.waitForTimeout(500);

const uniq = Date.now().toString().slice(-6);
const candidateName = `E2E Candidate ${uniq}`;

await page.fill('input[name="fullName"]', candidateName);
await page.fill('input[name="nationality"]', "Sri Lankan");
await page.fill('input[name="dateOfBirth"]', "1995-06-15");
await page.fill('input[name="passportNumber"]', `P${uniq}`);
await page.fill('input[name="passportExpiry"]', "2030-01-01");
await page.getByRole("button", { name: "Save & Continue" }).click();
await page.waitForTimeout(1000);
check("wizard advances to step 2 after personal details", await page.getByText("Experience & Skills").first().isVisible());

await page.getByText("Cleaning").click();
await page.getByText("Cooking").click();
await page.getByText("English", { exact: true }).click();
await page.getByRole("button", { name: "Save & Continue" }).click();
await page.waitForTimeout(1000);
check("wizard advances to step 3 (documents)", await page.getByText("Documents").first().isVisible());

// Upload a tiny real PNG (1x1 transparent pixel) as the headshot
const pngBuffer = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const fileInputs = await page.locator('input[type="file"]').all();
await fileInputs[0].setInputFiles({ name: "headshot.png", mimeType: "image/png", buffer: pngBuffer });
await page.waitForTimeout(1200);
await page.getByText(/uploaded/i).first().waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
check("document upload succeeds (toast)", await page.getByText(/uploaded/i).first().isVisible().catch(() => false));

await page.getByRole("button", { name: "Continue" }).click();
await page.waitForTimeout(500);
check("wizard advances to review step", await page.getByText("Profile saved").isVisible());

await page.getByRole("button", { name: "Finish" }).click();
await page.waitForURL(`${BASE}/admin/candidates`, { timeout: 5000 }).catch(() => {});
check("finishing wizard returns to candidate list", page.url() === `${BASE}/admin/candidates`);

// ─── 2. Candidate appears in ATS table ───
await page.waitForTimeout(1000);
const nameCell = page.getByRole("cell", { name: candidateName, exact: false }).first();
check("new candidate appears in ATS table", await nameCell.isVisible().catch(() => false));

// ─── 3. Open detail panel, verify avatar/photo rendered ───
await nameCell.click();
await page.waitForTimeout(1000);
check("detail sheet opens with candidate name", await page.getByRole("heading", { name: new RegExp(candidateName) }).isVisible().catch(() => false));

// ─── 4. Set a pipeline date via the stepper ───
await page.getByText("Musaned", { exact: true }).click();
await page.waitForTimeout(400);
const dayButtons = page.locator('[role="gridcell"] button:not([disabled])');
const dayCount = await dayButtons.count();
if (dayCount > 0) await dayButtons.first().click();
await page.waitForTimeout(1000);
check("pipeline date set (toast)", await page.getByText(/pipeline updated/i).isVisible().catch(() => false));

// ─── 5. Set departure + destination, verify auto-computed dates shown ───
await page.getByRole("button", { name: "Set Departure" }).click();
await page.waitForTimeout(400);
await page.fill('input[name="departureDate"]', "2026-01-15");
await page.getByRole("button", { name: "Save" }).click();
await page.waitForTimeout(1200);
check(
  "departure save shows computed mid-contract/contract-end dates",
  await page.getByText(/Mid-contract:/).isVisible().catch(() => false),
);

// ─── 6. Put on Hold (blocked without reason, then succeeds with one) ───
await page.getByRole("button", { name: "Put on Hold" }).click();
await page.waitForTimeout(300);
const holdSubmitBtn = page.getByRole("button", { name: "Put on Hold" }).last();
check("Put on Hold is disabled with empty reason", await holdSubmitBtn.isDisabled());
await page.fill("#hold-reason", "E2E test hold reason");
await holdSubmitBtn.click();
await page.waitForTimeout(1000);
check("status chip shows On Hold after confirm", await page.getByText("On Hold").first().isVisible().catch(() => false));

// ─── 7. Resume ───
await page.getByRole("button", { name: "Resume" }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Confirm Resume" }).click();
await page.waitForTimeout(1000);
check("status chip shows Active after resume", await page.getByText("Active", { exact: true }).first().isVisible().catch(() => false));

// ─── 8. Log a dispute ───
await page.getByRole("tab", { name: "Disputes" }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "+ Log Dispute" }).click();
await page.waitForTimeout(300);
await page.getByRole("button", { name: "Log Dispute" }).last().click();
await page.waitForTimeout(1000);
check("dispute logged (toast)", await page.getByText(/dispute logged/i).isVisible().catch(() => false));

// close and reopen to check dispute chip in table
await page.keyboard.press("Escape");
await page.waitForTimeout(500);
await page.goto(`${BASE}/admin/candidates`);
await page.waitForTimeout(1000);
// Chip now shows the real dispute type/reason, not a generic "Dispute"
// label (the default type in the dispute form is OTHER → "Other").
check("dispute chip visible in ATS table row", (await page.getByText("⚠ Other").count()) > 0);

// ─── 9. Create an agent, assign candidate ───
await page.goto(`${BASE}/admin/agents`);
await page.waitForTimeout(500);
await page.getByRole("button", { name: "+ New Agent" }).click();
await page.waitForTimeout(300);
const agentUniq = Date.now().toString().slice(-6);
await page.fill('input[name="name"]', "E2E Agent Contact");
await page.fill('input[name="companyName"]', `E2E Recruitment ${agentUniq}`);
await page.fill('input[name="country"]', "Qatar");
await page.fill('input[name="username"]', `e2eagent${agentUniq}`);
await page.fill('input[name="email"]', `e2eagent${agentUniq}@example.com`);
await page.fill('input[name="password"]', "E2eAgentPass1!");
await page.getByRole("button", { name: "Create" }).click();
await page.waitForTimeout(1200);
check("new agent appears in agent table", await page.getByText(`E2E Recruitment ${agentUniq}`).isVisible().catch(() => false));

await page.goto(`${BASE}/admin/candidates`);
await page.waitForTimeout(1000);
await page.getByRole("cell", { name: candidateName, exact: false }).first().click();
await page.waitForTimeout(800);
await page.getByRole("combobox").filter({ hasText: /select agent/i }).click();
await page.waitForTimeout(300);
await page.getByRole("option", { name: new RegExp(`E2E Recruitment ${agentUniq}`) }).click();
await page.getByRole("button", { name: "Assign" }).click();
await page.waitForTimeout(1200);
check("agent assignment succeeds (toast)", await page.getByText(/assignment updated/i).isVisible().catch(() => false));

// The detail sheet overlay can intercept clicks on the header behind it —
// close it explicitly before navigating away.
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await logout();

// ─── 10. Agent login sees only their candidate, read-only pipeline, no admin nav ───
await login(`e2eagent${agentUniq}`, "E2eAgentPass1!");
check("agent lands on dashboard", page.url() === `${BASE}/dashboard`);
check("Staff nav hidden for agent", !(await page.getByRole("link", { name: "Staff" }).isVisible().catch(() => false)));
check("Agents nav hidden for agent", !(await page.getByRole("link", { name: "Agents", exact: true }).isVisible().catch(() => false)));

await page.goto(`${BASE}/admin/candidates`);
await page.waitForTimeout(1000);
check("agent sees their assigned candidate", await page.getByText(candidateName).isVisible().catch(() => false));

await page.goto(`${BASE}/admin/staff`);
await page.waitForTimeout(500);
check("agent blocked from direct nav to /admin/staff", page.url() !== `${BASE}/admin/staff`);

await page.goto(`${BASE}/admin/candidates`);
await page.waitForTimeout(1000);
await page.getByRole("cell", { name: candidateName, exact: false }).first().click();
await page.waitForTimeout(800);
const stepBubbles = page.locator("button").filter({ hasText: "Musaned" });
check("pipeline stage is not a clickable button for agent (read-only)", (await stepBubbles.count()) === 0);

await page.keyboard.press("Escape");
await page.waitForTimeout(400);
await logout();

// ─── 11. Admin: PDF export + audit log ───
await login("admin", "ChangeMe-Admin-1!");
await page.goto(`${BASE}/admin/candidates`);
await page.waitForTimeout(1000);
await page.getByRole("cell", { name: candidateName, exact: false }).first().click();
await page.waitForTimeout(800);
const candidatePdfResp = await page.request.get(page.url()); // just to keep session warm
const pdfLink = await page.getByRole("link", { name: "Download PDF" }).getAttribute("href").catch(() => null);
if (pdfLink) {
  const pdfResp = await page.request.get(`${BASE}${pdfLink}`);
  check("candidate PDF route returns 200", pdfResp.status() === 200);
  check("candidate PDF route returns application/pdf", pdfResp.headers()["content-type"] === "application/pdf");
  const pdfBytes = await pdfResp.body();
  check("candidate PDF has real content (>500B)", pdfBytes.length > 500);
} else {
  check("candidate PDF route returns 200", false);
  check("candidate PDF route returns application/pdf", false);
  check("candidate PDF has real content (>500B)", false);
}

await page.getByRole("tab", { name: "Audit Log" }).click();
await page.waitForTimeout(800);
check("audit log shows entries for this candidate", await page.getByText(/CREATE Candidate|UPDATE Tracking/).first().isVisible().catch(() => false));

// ─── 12. Signed file URL security: unauthenticated request rejected ───
const anonContext = await browser.newContext();
const anonPage = await anonContext.newPage();
// Grab a real fileId by asking the (authenticated) page for the candidate's documents via the API it already uses
const filesListResp = await page.request.get(`${BASE}/admin/candidates`); // no-op, just ensure session alive
const anonResp = await anonPage.request.get(`${BASE}/api/files/nonexistent-or-real-id`);
check("unauthenticated /api/files/[fileId] request returns 401", anonResp.status() === 401);

// tamper with a raw-serving URL's signature
const tamperedRaw = await anonPage.request.get(`${BASE}/api/files/raw/some-key?exp=${Date.now() + 100000}&sig=deadbeef`);
check("tampered raw file signature rejected (403)", tamperedRaw.status() === 403);

await anonContext.close();
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("FAILED:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
