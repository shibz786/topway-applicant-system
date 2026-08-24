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

// ─── Setup: admin creates a candidate + agent, opts candidate into databank ───
await login("admin", "ChangeMe-Admin-1!");

await page.goto(`${BASE}/admin/candidates/new`);
await page.waitForTimeout(500);
const uniq = Date.now().toString().slice(-6);
const candidateName = `P4 Candidate ${uniq}`;
await page.fill('input[name="fullName"]', candidateName);
await page.fill('input[name="nationality"]', "Filipino");
await page.fill('input[name="dateOfBirth"]', "1990-03-10");
await page.fill('input[name="passportNumber"]', `Q${uniq}`);
await page.fill('input[name="passportExpiry"]', "2031-01-01");
await page.getByRole("button", { name: "Save & Continue" }).click();
await page.waitForTimeout(1000);
await page.getByText("Cooking").click();
await page.getByRole("button", { name: "Save & Continue" }).click();
await page.waitForTimeout(1000);
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForTimeout(500);
await page.getByRole("button", { name: "Finish" }).click();
await page.waitForURL(`${BASE}/admin/candidates`, { timeout: 5000 }).catch(() => {});

// Opt into databank via the detail panel
await page.getByRole("cell", { name: candidateName, exact: false }).first().click();
await page.waitForTimeout(800);
await page.getByRole("switch", { name: /opt into shared databank/i }).click();
await page.waitForTimeout(800);
check("candidate opted into databank (toast)", await page.getByText(/databank listing updated/i).isVisible().catch(() => false));
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// Create an agent WITHOUT databank access first (for the "no databank tab" check),
// then a second one WITH it (for the request flow).
await page.goto(`${BASE}/admin/agents`);
await page.waitForTimeout(500);

const agentUniq = Date.now().toString().slice(-6);
async function createAgent(suffix, withDatabank) {
  await page.getByRole("button", { name: "+ New Agent" }).click();
  await page.waitForTimeout(300);
  await page.fill('input[name="name"]', "P4 Agent Contact");
  await page.fill('input[name="companyName"]', `P4 Recruitment ${suffix}`);
  await page.fill('input[name="country"]', "Oman");
  await page.fill('input[name="username"]', `p4agent${suffix}`);
  await page.fill('input[name="email"]', `p4agent${suffix}@example.com`);
  await page.fill('input[name="password"]', "P4AgentPass1!");
  if (withDatabank) await page.getByRole("switch").click();
  await page.getByRole("button", { name: "Create" }).click();
  await page.waitForTimeout(1000);
}
await createAgent(`nodb${agentUniq}`, false);
await createAgent(`db${agentUniq}`, true);
check("both agents created", await page.getByText(`P4 Recruitment db${agentUniq}`).isVisible().catch(() => false));

await logout();

// ─── Agent WITHOUT databank access: no Databank tab, empty My Applications ───
await login(`p4agentnodb${agentUniq}`, "P4AgentPass1!");
check("agent nav link goes to My Applications", await page.getByRole("link", { name: "My Applications" }).isVisible().catch(() => false));
await page.getByRole("link", { name: "My Applications" }).click();
await page.waitForURL(`${BASE}/agent`, { timeout: 5000 }).catch(() => {});
check("clicking nav link lands on /agent", page.url() === `${BASE}/agent`);
await page.waitForTimeout(500);
check("no Databank tab for agent without access", !(await page.getByRole("link", { name: "Databank" }).isVisible().catch(() => false)));
await logout();

// ─── Agent WITH databank access: sees Databank nav link (its own top-level
// route now, not a tab nested under My Applications), requests assignment ───
await login(`p4agentdb${agentUniq}`, "P4AgentPass1!");
await page.goto(`${BASE}/agent`);
await page.waitForTimeout(800);
check("Databank tab visible for agent with access", await page.getByRole("link", { name: "Databank" }).isVisible().catch(() => false));
await page.getByRole("link", { name: "Databank" }).click();
await page.waitForURL(`${BASE}/agent/databank`, { timeout: 5000 }).catch(() => {});
await page.waitForTimeout(1000);
check("databank shows the opted-in candidate", await page.getByText(candidateName).isVisible().catch(() => false));

const candidateCard = page.locator(".grid > div", { hasText: candidateName }).first();
await candidateCard.getByRole("button", { name: "Request Assignment" }).click();
await page.waitForTimeout(1000);
check("request assignment shows success toast", await page.getByText(/request sent to admin/i).isVisible().catch(() => false));
check("button becomes 'Requested' and disabled", await candidateCard.getByRole("button", { name: "Requested" }).isDisabled().catch(() => false));

// ─── Mobile responsiveness check at 375px ───
await page.setViewportSize({ width: 375, height: 700 });
await page.goto(`${BASE}/agent`);
await page.waitForTimeout(1000);
const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
check("no horizontal overflow at 375px", scrollWidth <= 376);
await page.setViewportSize({ width: 1280, height: 800 });

await logout();

// ─── Admin approves the databank request ───
await login("admin", "ChangeMe-Admin-1!");
await page.goto(`${BASE}/admin/agents`);
await page.waitForTimeout(1000);
check("pending databank request visible to admin", await page.getByText(new RegExp(`P4 Recruitment db${agentUniq}.*requested.*${candidateName}`)).isVisible().catch(() => false));

await page.getByRole("button", { name: "Approve" }).click();
await page.waitForTimeout(1200);
check("approval shows success toast", await page.getByText(/candidate assigned/i).isVisible().catch(() => false));
check("request disappears from pending list after approval", !(await page.getByText(/requested/i).isVisible().catch(() => false)));

// Verify the placement actually landed by checking the candidate's assigned agent
await page.goto(`${BASE}/admin/candidates`);
await page.waitForTimeout(1000);
await page.getByRole("cell", { name: candidateName, exact: false }).first().click();
await page.waitForTimeout(800);
check(
  "candidate now shows assigned to the requesting agent",
  await page.getByText(new RegExp(`Currently assigned to P4 Recruitment db${agentUniq}`)).isVisible().catch(() => false),
);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);

// ─── Contract-closure modal: force a candidate's contract to have ended, then check agent portal ───
// (Uses the admin session's own request context to run the DB update via a throwaway API-less path
// is not available client-side, so this part is verified separately via direct DB manipulation —
// see the shell commands run alongside this script.)

await logout();
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) {
  console.log("FAILED:", failed.map((f) => f.name).join(", "));
  process.exit(1);
}
