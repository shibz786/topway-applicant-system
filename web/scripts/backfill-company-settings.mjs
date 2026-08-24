// One-time data completion — same real values used before (see the PDF
// revert work in CLAUDE.md): companyFooter is identical across every
// migrated invoice; bankDetails is seeded with the cleaner/most-recent
// looking entry as an admin-editable default. Re-run whenever the DB is
// rebuilt from scratch (e.g. after moving to a new Supabase project).
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const data = {
  bankName: "BANK OF CEYLON - COLOMBO 10",
  accountNo: "92761782",
  accountName: "Topway Private Limited",
  swiftCode: "BCEYLKLXXXX",
  email: "info@topway.lk",
  phone: "+94 115 991 089",
  fax: "+94 115 931 272",
  address: "No.95 1/1, S. Mahinda Himi Mawatha, Maradana, Colombo 10",
  website: "www.topway.lk",
};

await db.companySettings.upsert({
  where: { id: "singleton" },
  create: { id: "singleton", ...data },
  update: data,
});
console.log("CompanySettings backfilled.");
await db.$disconnect();
