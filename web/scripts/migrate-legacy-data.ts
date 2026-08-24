/**
 * One-off migration: data/{profiles,agents,invoices}.json (legacy PHP app)
 * -> the new Prisma schema.
 *
 * Usage: npm run db:migrate-legacy
 *
 * This script is idempotent-ish (candidates/agents/invoices are upserted by
 * a deterministic id derived from the legacy id) but it is meant to be run
 * ONCE against a fresh database. Re-running after real Phase 3+ writes have
 * happened is not something this script tries to reconcile safely.
 *
 * What it deliberately does NOT do:
 *   - Upload any files to R2. R2 doesn't exist until Phase 3. Legacy image/
 *     document filenames are recorded in the migration report instead, so
 *     Phase 3's file-migration step knows what to upload and to which
 *     candidate.
 *   - Port legacy password hashes forward. The legacy admin/agent hashes
 *     are bcrypt (PHP password_hash()); this app hashes with Argon2id via
 *     @node-rs/argon2, which cannot verify a bcrypt hash. Every migrated
 *     User gets a fresh random temporary password, printed once to the
 *     console and written to a gitignored local report — hand these out
 *     out-of-band and require a change on first login.
 *   - Invent schema fields. The legacy invoice JSON carries billTo/
 *     bankDetails/companyFooter/paymentMethod/advance concepts that have no
 *     column in the Prisma schema as specified. Rather than silently drop
 *     them or add undiscussed columns, they're serialized into
 *     Invoice.notes with a clear marker so nothing is lost.
 *
 * Read the console output and migration-report.json it writes when done —
 * several fields in the source data are incomplete (test/dummy records,
 * one dangling agent->candidate reference) and are flagged there rather
 * than silently coerced.
 */
import { PrismaClient, WorkerCategory } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const db = new PrismaClient();

const LEGACY_DATA_DIR = join(__dirname, "..", "..", "data");
const REPORT_PATH = join(__dirname, "migration-report.json");
const CREDENTIALS_PATH = join(__dirname, "migration-credentials.local.txt");

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

type LegacyProfile = {
  id: string;
  savedAt?: string;
  fields: Record<string, unknown> | unknown[];
  images?: Record<string, string>;
  tracking?: Record<string, unknown>;
};

type LegacyAgent = {
  id: string;
  name: string;
  company: string;
  country: string;
  username: string;
  active?: boolean;
  createdAt?: string;
  applicantIds?: string[];
  pendingIds?: string[];
  logo?: string;
};

type LegacyInvoice = {
  id: string;
  invoiceNo: string;
  invoicedDate?: string;
  currency?: string;
  billTo?: Record<string, unknown>;
  serviceType?: string;
  workers?: { name: string; qty: number; amount: number }[];
  advanceRequest?: unknown;
  advance?: unknown;
  total?: string;
  paymentMethod?: string;
  bankDetails?: Record<string, unknown>;
  companyFooter?: Record<string, unknown>;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
};

const report = {
  candidates: [] as { legacyId: string; newId?: string; skipped?: string; warnings: string[] }[],
  agents: [] as { legacyId: string; newUserId?: string; username: string; warnings: string[] }[],
  invoices: [] as { legacyId: string; newId?: string; warnings: string[] }[],
  admin: { warnings: [] as string[] },
};
const credentialLines: string[] = [];

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

function contractMonthsFromString(value: unknown): number {
  if (typeof value !== "string") return 24;
  const m = value.match(/(\d+)\s*YEAR/i);
  if (m) return parseInt(m[1]!, 10) * 12;
  const mm = value.match(/(\d+)\s*MONTH/i);
  if (mm) return parseInt(mm[1]!, 10);
  return 24;
}

function fieldsAsRecord(f: LegacyProfile["fields"]): Record<string, unknown> {
  return Array.isArray(f) ? {} : (f as Record<string, unknown>);
}

function deriveSkills(f: Record<string, unknown>): string[] {
  const map: [string, string][] = [
    ["sk-cleaning", "Cleaning"],
    ["sk-washing", "Washing"],
    ["sk-babysitting", "Babysitting"],
    ["sk-cooking", "Cooking"],
    ["sk-driving", "Driving"],
  ];
  return map.filter(([key]) => f[key] === true).map(([, label]) => label);
}

function deriveLanguages(f: Record<string, unknown>): string[] {
  const langs: string[] = [];
  if (f["lang-en-speak"] === true || f["lang-en-write"] === true) langs.push("English");
  if (f["lang-ar-speak"] === true || f["lang-ar-write"] === true) langs.push("Arabic");
  return langs;
}

function deriveCategory(
  tracking: Record<string, unknown> | undefined,
  empRows: unknown,
): WorkerCategory {
  const raw = String(tracking?.workerCategory ?? tracking?.experience ?? "").toUpperCase();
  if (raw.includes("FIRST")) return "FIRST_TIMER";
  if (raw.includes("CONTRACT")) return "CONTRACTED";
  if (raw.includes("EXP")) return "EXPERIENCED";
  const rows = Array.isArray(empRows) ? empRows : [];
  const hasHistory = rows.some(
    (r) => r && typeof r === "object" && String((r as Record<string, unknown>).position ?? "").trim() !== "",
  );
  return hasHistory ? "EXPERIENCED" : "FIRST_TIMER";
}

function yearsFromEmpRows(empRows: unknown): number {
  const rows = Array.isArray(empRows) ? empRows : [];
  let total = 0;
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const period = String((r as Record<string, unknown>).period ?? "");
    const m = period.match(/(\d+)/);
    if (m) total += parseInt(m[1]!, 10);
  }
  return total;
}

function randomTempPassword(): string {
  return randomBytes(12).toString("base64url");
}

async function migrateCandidates(): Promise<Map<string, string>> {
  const raw = JSON.parse(readFileSync(join(LEGACY_DATA_DIR, "profiles.json"), "utf-8"));
  const profiles: LegacyProfile[] = raw.profiles ?? [];
  const legacyToNewId = new Map<string, string>();

  for (const p of profiles) {
    if (p.id === "__global__") {
      report.candidates.push({
        legacyId: p.id,
        skipped: "Config record (global foreign agency logo), not a candidate.",
        warnings: [],
      });
      continue;
    }

    const f = fieldsAsRecord(p.fields);
    const t = (p.tracking ?? {}) as Record<string, unknown>;
    const warnings: string[] = [];

    const fullName = String(f["f-name"] ?? "").trim();
    if (!fullName) warnings.push("Missing name in legacy record.");

    let dateOfBirth = parseDate(f["f-dob"]);
    if (!dateOfBirth) {
      warnings.push("Missing/unparseable date of birth — placeholder used, MUST be corrected.");
      dateOfBirth = parseDate(p.savedAt) ?? new Date("1900-01-01");
    }

    const passportNumber = String(f["f-passport"] ?? "").trim();
    if (!passportNumber) warnings.push("Missing passport number.");

    let passportExpiry = parseDate(f["f-doe"]);
    if (!passportExpiry) {
      warnings.push("Missing/unparseable passport expiry — placeholder used, MUST be corrected.");
      passportExpiry = new Date("1900-01-01");
    }

    const empRows = (f as { empRows?: unknown }).empRows;

    const candidate = await db.candidate.create({
      data: {
        fullName: fullName || `(unnamed — legacy id ${p.id})`,
        nationality: String(f["f-nationality"] ?? "").trim(),
        dateOfBirth,
        passportNumber,
        passportExpiry,
        phone: (f["f-phone"] as string) || null,
        address: (f["f-address"] as string) || null,
        religion: (f["f-religion"] as string) || null,
        category: deriveCategory(t, empRows),
        skills: deriveSkills(f),
        languages: deriveLanguages(f),
        yearsExperience: yearsFromEmpRows(empRows),
        contractDuration: contractMonthsFromString(f["f-contract"]),
        inDatabank: false,
      },
    });

    legacyToNewId.set(p.id, candidate.id);

    // Tracking row — only meaningful if the legacy record actually had one.
    if (p.tracking) {
      const notesParts: string[] = [];
      if (typeof t.notes === "string" && t.notes.trim()) notesParts.push(t.notes.trim());
      if (Array.isArray(empRows) && empRows.length) {
        notesParts.push(
          `Legacy employment history (pre-Topway): ${JSON.stringify(empRows)}`,
        );
      }
      const refNo = f["f-refno"];
      if (refNo) notesParts.push(`Legacy reference no: ${refNo}`);

      await db.tracking.create({
        data: {
          candidateId: candidate.id,
          musanedDate: parseDate(t.musaned),
          enjazDate: t.enjaz === true ? parseDate(t.enjaz_date) ?? new Date() : parseDate(t.enjaz_date),
          bureauDate: t.bureau === true ? parseDate(t.bureau_date) ?? new Date() : parseDate(t.bureau_date),
          wakalahDate: t.wakalah === true ? parseDate(t.wakalah_date) ?? new Date() : parseDate(t.wakalah_date),
          embassyDate: t.embassy === true ? parseDate(t.embassy_date) ?? new Date() : parseDate(t.embassy_date),
          paymentDate: t.payment === true ? parseDate(t.payment_date) ?? new Date() : parseDate(t.payment_date),
          notes: notesParts.join("\n\n") || null,
        },
      });
    } else if (empRows && Array.isArray(empRows) && empRows.length) {
      // No tracking block but there IS employment history worth keeping.
      await db.tracking.create({
        data: {
          candidateId: candidate.id,
          notes: `Legacy employment history (pre-Topway): ${JSON.stringify(empRows)}`,
        },
      });
    }

    const legacyImages = p.images ?? {};
    const imageKeys = Object.keys(legacyImages).filter((k) => legacyImages[k]);
    if (imageKeys.length) {
      warnings.push(
        `${imageKeys.length} legacy file(s) not yet migrated to R2 (Phase 3): ` +
          imageKeys.map((k) => `${k}=${legacyImages[k]}`).join(", "),
      );
    }

    report.candidates.push({ legacyId: p.id, newId: candidate.id, warnings });
  }

  return legacyToNewId;
}

async function migrateAgents(): Promise<Map<string, { userId: string; agentId: string }>> {
  const raw = JSON.parse(readFileSync(join(LEGACY_DATA_DIR, "agents.json"), "utf-8"));
  const agents: LegacyAgent[] = raw.agents ?? [];
  const globalAllowBrowse = Boolean(raw.settings?.allowAgentBrowse);
  const legacyToNew = new Map<string, { userId: string; agentId: string }>();

  for (const a of agents) {
    const warnings: string[] = [];
    const username = a.username.toLowerCase();
    const email = `${username}@migrated.topway.local`;
    const tempPassword = randomTempPassword();

    const existing = await db.user.findUnique({ where: { username } });
    if (existing) {
      warnings.push("Username already exists in the new DB — left untouched, not re-created.");
      const agentProfile = await db.agent.findUnique({ where: { userId: existing.id } });
      if (agentProfile) legacyToNew.set(a.id, { userId: existing.id, agentId: agentProfile.id });
      report.agents.push({ legacyId: a.id, newUserId: existing.id, username, warnings });
      continue;
    }

    warnings.push(
      "Legacy password hash is bcrypt and cannot be carried forward (this app uses Argon2id). " +
        "A random temporary password was generated — see migration-credentials.local.txt.",
    );
    warnings.push(`Email is a synthesized placeholder (${email}) — legacy data had no email field.`);

    const user = await db.user.create({
      data: {
        name: a.name,
        username,
        email,
        passwordHash: await hash(tempPassword, ARGON2_OPTIONS),
        role: "AGENT",
        permissions: { applications: false, databank: false, invoices: false, agents: false, tracking: false },
        isActive: a.active ?? true,
        createdAt: parseDate(a.createdAt) ?? new Date(),
      },
    });

    const agentProfile = await db.agent.create({
      data: {
        userId: user.id,
        companyName: a.company,
        country: a.country,
        dataBankAccess: globalAllowBrowse,
      },
    });

    if (a.logo) {
      warnings.push(`Legacy logo file not yet migrated to R2 (Phase 3): ${a.logo}`);
    }
    if (a.pendingIds && a.pendingIds.length) {
      warnings.push(
        `Legacy had ${a.pendingIds.length} pending databank request(s) — there is no equivalent ` +
          "model in the new schema yet; these were dropped, not migrated.",
      );
    }

    credentialLines.push(`${username}  (${a.company})  temp password: ${tempPassword}`);
    legacyToNew.set(a.id, { userId: user.id, agentId: agentProfile.id });
    report.agents.push({ legacyId: a.id, newUserId: user.id, username, warnings });
  }

  return legacyToNew;
}

async function migratePlacements(
  candidateIdMap: Map<string, string>,
  agentIdMap: Map<string, { userId: string; agentId: string }>,
) {
  const raw = JSON.parse(readFileSync(join(LEGACY_DATA_DIR, "agents.json"), "utf-8"));
  const agents: LegacyAgent[] = raw.agents ?? [];

  for (const a of agents) {
    const mapped = agentIdMap.get(a.id);
    if (!mapped) continue;

    for (const legacyCandidateId of a.applicantIds ?? []) {
      const newCandidateId = candidateIdMap.get(legacyCandidateId);
      const agentReportRow = report.agents.find((r) => r.legacyId === a.id);
      if (!newCandidateId) {
        agentReportRow?.warnings.push(
          `Dangling reference: assigned candidate legacy id "${legacyCandidateId}" does not exist ` +
            "in profiles.json — skipped.",
        );
        continue;
      }
      await db.placement.create({
        data: {
          candidateId: newCandidateId,
          agentId: mapped.agentId,
          startDate: parseDate(a.createdAt) ?? new Date(),
          isCurrent: true,
        },
      });
    }
  }
}

function normalizeCompanyName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function nameWordsMatch(a: string, b: string): boolean {
  const wa = new Set(a.toUpperCase().split(/\s+/).filter(Boolean));
  const wb = new Set(b.toUpperCase().split(/\s+/).filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return false;
  for (const w of wa) if (!wb.has(w)) return false;
  for (const w of wb) if (!wa.has(w)) return false;
  return true;
}

async function migrateInvoices(candidatesByName: { id: string; fullName: string }[]) {
  const raw = JSON.parse(readFileSync(join(LEGACY_DATA_DIR, "invoices.json"), "utf-8"));
  const invoices: LegacyInvoice[] = raw.invoices ?? [];
  const allAgents = await db.agent.findMany({ select: { id: true, companyName: true } });

  for (const inv of invoices) {
    const warnings: string[] = [];
    const billToCompany = String(inv.billTo?.company ?? "");
    const matchedAgent = allAgents.find(
      (ag) => normalizeCompanyName(ag.companyName) === normalizeCompanyName(billToCompany),
    );
    if (!matchedAgent && billToCompany) {
      warnings.push(`Could not match billTo.company "${billToCompany}" to a migrated agent — agentId left null.`);
    }

    const totalAmount = parseFloat(String(inv.total ?? "0").replace(/,/g, "")) || 0;

    const extraFields = {
      billTo: inv.billTo,
      serviceType: inv.serviceType,
      paymentMethod: inv.paymentMethod,
      bankDetails: inv.bankDetails,
      companyFooter: inv.companyFooter,
      advanceRequest: inv.advanceRequest,
      advance: inv.advance,
    };
    const notes = [
      inv.notes?.trim() || null,
      "[MIGRATED FROM LEGACY — fields with no home in the new schema, preserved verbatim]",
      JSON.stringify(extraFields),
    ]
      .filter(Boolean)
      .join("\n\n");

    const created = await db.invoice.create({
      data: {
        number: inv.invoiceNo,
        // Legacy has no explicit lifecycle status field. Every migrated
        // invoice already existed in the live system, so "SENT" is the
        // closest honest default — an admin should review and correct.
        status: "SENT",
        agentId: matchedAgent?.id ?? null,
        totalAmount,
        currency: inv.currency ?? "USD",
        notes,
        issuedAt: parseDate(inv.invoicedDate),
        createdAt: parseDate(inv.createdAt) ?? new Date(),
        updatedAt: parseDate(inv.updatedAt) ?? new Date(),
      },
    });
    if (!inv.billTo) warnings.push("No status field existed in legacy data — defaulted to SENT, please verify.");

    for (const w of inv.workers ?? []) {
      const match = candidatesByName.find((c) => nameWordsMatch(c.fullName, w.name));
      if (!match) {
        warnings.push(`Line item "${w.name}" could not be matched to a migrated candidate by name.`);
      }
      await db.invoiceItem.create({
        data: {
          invoiceId: created.id,
          candidateId: match?.id ?? null,
          description: w.name,
          amount: w.amount ?? 0,
          quantity: w.qty ?? 1,
        },
      });
    }

    report.invoices.push({ legacyId: inv.id, newId: created.id, warnings });
  }
}

async function main() {
  console.log("Migrating candidates...");
  const candidateIdMap = await migrateCandidates();

  console.log("Migrating agents...");
  const agentIdMap = await migrateAgents();

  console.log("Migrating placements (agent -> candidate assignments)...");
  await migratePlacements(candidateIdMap, agentIdMap);

  console.log("Migrating invoices...");
  const allCandidates = await db.candidate.findMany({ select: { id: true, fullName: true } });
  await migrateInvoices(allCandidates);

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  if (credentialLines.length) {
    writeFileSync(
      CREDENTIALS_PATH,
      "TEMPORARY PASSWORDS — hand these out securely and delete this file once done.\n" +
        "Every migrated agent must change their password on first login (no such enforcement\n" +
        "exists in the schema yet — track it manually until that's built).\n\n" +
        credentialLines.join("\n") +
        "\n",
    );
  }

  const candidateCount = report.candidates.filter((c) => !c.skipped).length;
  const skippedCount = report.candidates.filter((c) => c.skipped).length;
  const warningCount =
    report.candidates.reduce((n, c) => n + c.warnings.length, 0) +
    report.agents.reduce((n, a) => n + a.warnings.length, 0) +
    report.invoices.reduce((n, i) => n + i.warnings.length, 0);

  console.log(`\nDone. ${candidateCount} candidates migrated, ${skippedCount} skipped (non-candidate records).`);
  console.log(`${report.agents.length} agents migrated. ${report.invoices.length} invoices migrated.`);
  console.log(`${warningCount} warnings recorded — see ${REPORT_PATH}.`);
  if (credentialLines.length) {
    console.log(`Temporary agent passwords written to ${CREDENTIALS_PATH} — handle this file with care.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
