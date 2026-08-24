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
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.waitForURL(`${BASE}/login`, { timeout: 8000 }).catch(() => {});
}

await login("admin", "ChangeMe-Admin-1!");

// ─── Tracking page loads with 6 tabs ───
await page.goto(`${BASE}/admin/tracking`);
await page.waitForTimeout(1200);
const tabLabels = ["Work in Progress", "Probation Completed", "Mid-Contract", "Contract Closed", "Remarketing Eligible", "Dispute Active"];
for (const label of tabLabels) {
  check(`tab "${label}" renders`, await page.getByRole("tab", { name: new RegExp(label) }).isVisible().catch(() => false));
}

// ─── Set up: candidate + two agents ───
const uniq = Date.now().toString().slice(-6);
const candidateName = `P5 Candidate ${uniq}`;

await page.goto(`${BASE}/admin/candidates/new`);
await page.waitForTimeout(500);
await page.fill('input[name="fullName"]', candidateName);
await page.fill('input[name="nationality"]', "Indonesian");
await page.fill('input[name="dateOfBirth"]', "1992-05-20");
await page.fill('input[name="passportNumber"]', `R${uniq}`);
await page.fill('input[name="passportExpiry"]', "2031-01-01");
await page.getByRole("button", { name: "Save & Continue" }).click();
await page.waitForTimeout(1000);
await page.getByRole("button", { name: "Save & Continue" }).click();
await page.waitForTimeout(1000);
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Finish" }).click();
await page.waitForURL(`${BASE}/admin/candidates`, { timeout: 5000 }).catch(() => {});

await page.goto(`${BASE}/admin/agents`);
await page.waitForTimeout(500);
async function createAgent(suffix) {
  await page.getByRole("button", { name: "+ New Agent" }).click();
  await page.waitForTimeout(300);
  await page.fill('input[name="name"]', "P5 Agent Contact");
  await page.fill('input[name="companyName"]', `P5 Recruitment ${suffix}`);
  await page.fill('input[name="country"]', "Kuwait");
  await page.fill('input[name="username"]', `p5agent${suffix}`);
  await page.fill('input[name="email"]', `p5agent${suffix}@example.com`);
  await page.fill('input[name="password"]', "P5AgentPass1!");
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForTimeout(1000);
}
await createAgent(`a${uniq}`);
await createAgent(`b${uniq}`);
check("two agents created", await page.getByText(`P5 Recruitment b${uniq}`).isVisible().catch(() => false));

// Assign candidate to Agent A
await page.goto(`${BASE}/admin/candidates`);
await page.waitForTimeout(1000);
await page.getByRole("cell", { name: candidateName, exact: false }).first().click();
await page.waitForTimeout(800);
await page.getByRole("combobox").filter({ hasText: /select agent/i }).click();
await page.waitForTimeout(300);
await page.getByRole("option", { name: new RegExp(`P5 Recruitment a${uniq}`) }).click();
await page.getByRole("button", { name: "Assign" }).click();
await page.waitForTimeout(1000);
check("candidate assigned to Agent A", await page.getByText(/assignment updated/i).isVisible().catch(() => false));

// Set departure so tracking stage logic has something to work with
await page.getByRole("button", { name: "Set Departure" }).click();
await page.waitForTimeout(400);
await page.fill('input[name="departureDate"]', "2025-01-01");
await page.getByRole("button", { name: "Save" }).click();
await page.waitForTimeout(1000);

// ─── Change of Employer: Agent A -> Agent B, with remarketing granted ───
await page.getByRole("button", { name: "Change Employer" }).click();
await page.waitForTimeout(500);
await page.getByRole("combobox").filter({ hasText: /select agent/i }).click();
await page.waitForTimeout(300);
await page.getByRole("option", { name: new RegExp(`P5 Recruitment b${uniq}`) }).click();
await page.fill("#changeReason", "Household relocated, E2E test");
await page.getByRole("switch", { name: /grant former agent remarketing/i }).click();
await page.getByRole("button", { name: "Confirm Change" }).click();
await page.waitForTimeout(1200);
check("change employer shows success toast", await page.getByText(/employer changed/i).isVisible().catch(() => false));

check(
  "detail panel now shows Agent B as current",
  await page.getByText(new RegExp(`Currently assigned to P5 Recruitment b${uniq}`)).isVisible().catch(() => false),
);

// Check placement history tab shows both agents, with remarketing note on the old one
await page.getByRole("tab", { name: "Placements" }).click();
await page.waitForTimeout(500);
const placementsPanel = page.getByRole("tabpanel", { name: "Placements" });
check("placement history shows Agent A", await placementsPanel.getByText(`P5 Recruitment a${uniq}`).isVisible().catch(() => false));
check("placement history shows Agent B", await placementsPanel.getByText(`P5 Recruitment b${uniq}`).isVisible().catch(() => false));
check("old placement shows remarketing visibility granted", await placementsPanel.getByText(/remarketing visibility granted/i).isVisible().catch(() => false));

await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await logout();

console.log(`\nCandidate for manual DB-stage checks: ${candidateName}`);

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("FAILED:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
