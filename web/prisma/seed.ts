/**
 * Phase 1 smoke-test seed: one user per role so login/logout can be
 * verified end-to-end. This is NOT the legacy data migration — see
 * scripts/migrate-legacy-data.ts for that.
 *
 * Usage: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";

const db = new PrismaClient();

const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
} as const;

async function main() {
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe-Admin-1!";
  const staffPassword = process.env.SEED_STAFF_PASSWORD ?? "ChangeMe-Staff-1!";
  const agentPassword = process.env.SEED_AGENT_PASSWORD ?? "ChangeMe-Agent-1!";

  const admin = await db.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      name: "System Admin",
      username: "admin",
      email: "admin@topway.test",
      passwordHash: await hash(adminPassword, ARGON2_OPTIONS),
      role: "ADMIN",
      permissions: { applications: true, databank: true, invoices: true, agents: true, tracking: true },
    },
  });

  const staff = await db.user.upsert({
    where: { username: "staff1" },
    update: {},
    create: {
      name: "Test Staff",
      username: "staff1",
      email: "staff1@topway.test",
      passwordHash: await hash(staffPassword, ARGON2_OPTIONS),
      role: "STAFF",
      permissions: { applications: true, databank: true, invoices: false, agents: false, tracking: true },
    },
  });

  const agentUser = await db.user.upsert({
    where: { username: "agent1" },
    update: {},
    create: {
      name: "Test Agent Contact",
      username: "agent1",
      email: "agent1@topway.test",
      passwordHash: await hash(agentPassword, ARGON2_OPTIONS),
      role: "AGENT",
      permissions: { applications: false, databank: false, invoices: false, agents: false, tracking: false },
    },
  });

  await db.agent.upsert({
    where: { userId: agentUser.id },
    update: {},
    create: {
      userId: agentUser.id,
      companyName: "Test Recruitment Co.",
      country: "Saudi Arabia",
      dataBankAccess: true,
    },
  });

  console.log("Seeded users:");
  console.log(`  admin  / ${adminPassword}  (${admin.username})`);
  console.log(`  staff1 / ${staffPassword}  (${staff.username})`);
  console.log(`  agent1 / ${agentPassword}  (${agentUser.username})`);
  console.log("\nChange these passwords before anything resembling production use.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
