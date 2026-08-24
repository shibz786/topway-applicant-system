import "server-only";
import { db } from "@/lib/db";
import type { SessionUser } from "./session";
import { ForbiddenError } from "./session";

// Per the permissions matrix: admin and staff can view any candidate
// (viewing needs no specific flag — only *editing* needs `applications`);
// an agent can only view a candidate they're currently placed with, or one
// where a prior placement of theirs has remarketingDate set (dual-agent
// visibility during a change of employer).
export async function assertCanViewCandidate(user: SessionUser, candidateId: string): Promise<void> {
  if (user.role === "ADMIN" || user.role === "STAFF") return;

  if (user.role === "AGENT") {
    if (!user.agentId) throw new ForbiddenError();
    const placement = await db.placement.findFirst({
      where: {
        candidateId,
        agentId: user.agentId,
        OR: [{ isCurrent: true }, { remarketingDate: { not: null } }],
      },
      select: { id: true },
    });
    if (!placement) throw new ForbiddenError();
    return;
  }

  throw new ForbiddenError();
}
