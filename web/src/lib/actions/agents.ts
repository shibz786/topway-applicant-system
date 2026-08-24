"use server";

import { db } from "@/lib/db";
import { requireSession, runAsActor } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/authorize";
import { hashPassword } from "@/lib/auth/password";
import {
  createAgentSchema,
  updateAgentSchema,
  assignCandidateSchema,
  changeEmployerSchema,
  type CreateAgentInput,
  type UpdateAgentInput,
  type ChangeEmployerInput,
} from "@/lib/validation/agent";
import { runAction, ActionError, type ActionResult } from "./result";

// "Assign/reassign candidates to agents" and "Agent management" are gated
// on the `agents` permission flag (admin always passes) throughout this
// file — CLAUDE.md permissions matrix.

export type AgentRow = Awaited<ReturnType<typeof listAgentsInternal>>[number];

async function listAgentsInternal() {
  return db.agent.findMany({
    orderBy: { companyName: "asc" },
    include: {
      user: { select: { id: true, name: true, username: true, email: true, isActive: true } },
      _count: { select: { placements: { where: { isCurrent: true } } } },
    },
  });
}

export async function listAgents(): Promise<ActionResult<AgentRow[]>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "agents");
    return listAgentsInternal();
  });
}

export async function createAgent(input: CreateAgentInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "agents");

    const parsed = createAgentSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const data = parsed.data;

    const existing = await db.user.findFirst({
      where: { OR: [{ username: data.username }, { email: data.email }] },
    });
    if (existing) throw new ActionError("Username or email already in use");

    const newUser = await db.user.create({
      data: {
        name: data.name,
        username: data.username,
        email: data.email,
        passwordHash: await hashPassword(data.password),
        role: "AGENT",
        permissions: { applications: false, databank: false, invoices: false, agents: false, tracking: false },
        agentProfile: {
          create: {
            companyName: data.companyName,
            country: data.country,
            dataBankAccess: data.dataBankAccess,
          },
        },
      },
      include: { agentProfile: true },
    });
    return { id: newUser.agentProfile!.id };
  });
}

export async function updateAgent(input: UpdateAgentInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "agents");

    const parsed = updateAgentSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const data = parsed.data;

    const agent = await db.agent.findUnique({ where: { id: data.id } });
    if (!agent) throw new ActionError("Agent not found");

    const emailConflict = await db.user.findFirst({ where: { email: data.email, NOT: { id: agent.userId } } });
    if (emailConflict) throw new ActionError("Email already in use");

    await db.$transaction([
      db.user.update({
        where: { id: agent.userId },
        data: {
          name: data.name,
          email: data.email,
          isActive: data.isActive,
          ...(data.password ? { passwordHash: await hashPassword(data.password) } : {}),
        },
      }),
      db.agent.update({
        where: { id: data.id },
        data: { companyName: data.companyName, country: data.country, dataBankAccess: data.dataBankAccess },
      }),
    ]);
    return null;
  });
}

// Assign/reassign: closes any existing current placement for this
// candidate, opens a new one with the target agent. Per CLAUDE.md, this is
// how "assign/reassign candidates to agents" works — it always
// creates/closes Placement rows, never just flips a foreign key.
export async function assignCandidateToAgent(input: {
  candidateId: string;
  agentId: string;
}): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "agents");

    const parsed = assignCandidateSchema.safeParse(input);
    if (!parsed.success) throw new ActionError("Invalid input");
    const { candidateId, agentId } = parsed.data;

    const [candidate, agent] = await Promise.all([
      db.candidate.findUnique({ where: { id: candidateId } }),
      db.agent.findUnique({ where: { id: agentId } }),
    ]);
    if (!candidate) throw new ActionError("Candidate not found");
    if (!agent) throw new ActionError("Agent not found");

    // Read outside the transaction (fine on the regular pooled `db`
    // client — this is a low-frequency, human-driven action, not a hot
    // path where a race here would matter in practice), then batch the
    // write(s) that decision implies. Array-batch, not the interactive
    // callback form — see the long comment on the datasource block in
    // schema.prisma for why that distinction matters.
    const current = await db.placement.findFirst({ where: { candidateId, isCurrent: true } });
    if (current?.agentId === agentId) return null; // already assigned here — no-op

    await runAsActor(user, () =>
      db.$transaction([
        ...(current
          ? [
              db.placement.update({
                where: { id: current.id },
                data: { isCurrent: false, endDate: new Date(), changeReason: "Reassigned by admin/staff" },
              }),
            ]
          : []),
        db.placement.create({ data: { candidateId, agentId } }),
      ]),
    );
    return null;
  });
}

export async function unassignCandidate(input: { candidateId: string }): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "agents");

    const current = await db.placement.findFirst({
      where: { candidateId: input.candidateId, isCurrent: true },
    });
    if (!current) return null;

    await runAsActor(user, () =>
      db.placement.update({
        where: { id: current.id },
        data: { isCurrent: false, endDate: new Date(), changeReason: "Unassigned by admin/staff" },
      }),
    );
    return null;
  });
}

// "Change of employer/house" — CLAUDE.md: closes the current Placement
// (endDate, isCurrent=false, changeReason), creates a new one. Setting
// remarketingDate on the OLD placement grants the former agent dual
// visibility alongside the new one (both then see the candidate).
export async function changeEmployer(input: ChangeEmployerInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    requirePermission(user, "agents");

    const parsed = changeEmployerSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const data = parsed.data;

    const [candidate, newAgent] = await Promise.all([
      db.candidate.findUnique({ where: { id: data.candidateId } }),
      db.agent.findUnique({ where: { id: data.newAgentId } }),
    ]);
    if (!candidate) throw new ActionError("Candidate not found");
    if (!newAgent) throw new ActionError("Agent not found");

    // Same read-outside-then-batch pattern as assignCandidateToAgent()
    // above — see its comment for why.
    const current = await db.placement.findFirst({
      where: { candidateId: data.candidateId, isCurrent: true },
    });

    await runAsActor(user, () =>
      db.$transaction([
        ...(current
          ? [
              db.placement.update({
                where: { id: current.id },
                data: {
                  isCurrent: false,
                  endDate: new Date(),
                  changeReason: data.changeReason,
                  remarketingDate: data.grantRemarketing ? new Date() : null,
                },
              }),
            ]
          : []),
        db.placement.create({
          data: {
            candidateId: data.candidateId,
            agentId: data.newAgentId,
            employerName: data.employerName || null,
          },
        }),
      ]),
    );
    return null;
  });
}
