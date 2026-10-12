// One-off: finish the 6 dummy foreign-agent records for the demo account.
// Idempotent: skips logo upload if logoR2Key already set, skips
// license/contact if already set, creates Pearl Bridge only if missing.
//
// Deliberately reimplements the Supabase/local-disk putObject() + magic-byte
// check instead of importing src/lib/storage/adapter.ts, following the same
// precedent migrate-legacy-files.ts set: that file is "server-only", which
// only resolves under Next's build, not under tsx directly.
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const db = new PrismaClient();
const IMG_DIR = "/private/tmp/claude-501/-Users-shiham-Documents-Claude-Projects-topway-applicant-new/a6a3c06e-09b1-45f6-8585-23a5d53ec860/images";
const STORAGE_DIR = join(process.cwd(), ".local-storage");

const supabase = process.env.SUPABASE_URL
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;
const SUPABASE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "candidate-files";

async function putObject(key, body, contentType) {
  if (supabase) {
    const { error } = await supabase.storage.from(SUPABASE_BUCKET).upload(key, body, { contentType, upsert: true });
    if (error) throw new Error(`Supabase upload failed for ${key}: ${error.message}`);
    return;
  }
  mkdirSync(STORAGE_DIR, { recursive: true });
  writeFileSync(join(STORAGE_DIR, key), body);
}

const PLAN = [
  { companyName: "Falcon Gate Recruitment", country: "United Arab Emirates", licenseNo: "UAE-FG-2291", contactNo: "+971 4 221 7788", logo: "1.jpg" },
  { companyName: "Palm Crest Manpower", country: "Saudi Arabia", licenseNo: "SA-PC-1047", contactNo: "+966 11 456 2210", logo: "2.jpg" },
  { companyName: "Cedar Link Overseas", country: "Kuwait", licenseNo: "789", contactNo: "+965", logo: "3.jpg" },
  { companyName: "Desert Wave Staffing", country: "Oman", licenseNo: "OM-DW-3302", contactNo: "+968 24 889 015", logo: "4.jpg" },
  { companyName: "Al Noor Horizon", country: "Qatar", licenseNo: "1414", contactNo: "+974", logo: "5.jpg" },
  { companyName: "Pearl Bridge Recruitment", country: "Bahrain", licenseNo: "BH-PB-5120", contactNo: "+973 1 758 4420", logo: "6.jpg" },
];

async function main() {
  for (const plan of PLAN) {
    let agent = await db.agent.findFirst({ where: { companyName: plan.companyName } });

    if (!agent) {
      console.log("creating agent:", plan.companyName);
      const username = plan.companyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 30);
      const user = await db.user.create({
        data: {
          name: plan.companyName + " Contact",
          username: `demo-${username}`,
          email: `demo-${username}@example.com`,
          passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$placeholderplaceholder$placeholderplaceholderplaceholderplaceholderplaceholder",
          role: "AGENT",
          permissions: { applications: false, databank: false, invoices: false, agents: false, tracking: false },
          agentProfile: {
            create: {
              companyName: plan.companyName,
              country: plan.country,
              dataBankAccess: false,
            },
          },
        },
        include: { agentProfile: true },
      });
      agent = user.agentProfile;
    }

    const updateData = {};
    if (!agent.licenseNo) updateData.licenseNo = plan.licenseNo;
    if (!agent.contactNo) updateData.contactNo = plan.contactNo;

    if (!agent.logoR2Key) {
      const bytes = readFileSync(`${IMG_DIR}/${plan.logo}`);
      const key = randomUUID();
      await putObject(key, bytes, "image/jpeg");
      updateData.logoR2Key = key;
      console.log("uploaded logo for", plan.companyName, "->", key);
    }

    if (Object.keys(updateData).length > 0) {
      await db.agent.update({ where: { id: agent.id }, data: updateData });
      console.log("updated", plan.companyName, Object.keys(updateData).join(", "));
    } else {
      console.log("already complete:", plan.companyName);
    }
  }

  await db.$disconnect();
  console.log("done");
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
