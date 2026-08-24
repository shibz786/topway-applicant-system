"use server";

import { db } from "@/lib/db";
import { lucia } from "@/lib/auth/lucia";
import { requireSession, runAsActor, ForbiddenError } from "@/lib/auth/session";
import { blacklistSession } from "@/lib/kv/session-blacklist";
import { runAction, type ActionResult } from "./result";

// CLAUDE.md: "An admin can revoke all sessions for any user" / "Revoke
// sessions: Admin any user, Staff/Agent own only." Every function here
// re-derives that rule server-side rather than trusting the caller.

export async function listSessionsForUser(userId: string): Promise<ActionResult<
  { id: string; createdAt: Date; expiresAt: Date; userAgent: string | null; ipAddress: string | null }[]
>> {
  return runAction(async () => {
    const user = await requireSession();
    if (user.role !== "ADMIN" && user.id !== userId) throw new ForbiddenError();

    return db.session.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, expiresAt: true, userAgent: true, ipAddress: true },
    });
  });
}

export async function revokeSession(sessionId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    const session = await db.session.findUnique({ where: { id: sessionId } });
    if (!session) return null; // already gone — idempotent
    if (user.role !== "ADMIN" && session.userId !== user.id) throw new ForbiddenError();

    await runAsActor(user, async () => {
      await lucia.invalidateSession(sessionId);
    });
    await blacklistSession(sessionId);
    return null;
  });
}

export async function revokeAllSessionsForUser(userId: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    if (user.role !== "ADMIN" && user.id !== userId) throw new ForbiddenError();

    // Fetch ids before invalidating — invalidateUserSessions deletes the
    // rows, so this is the only chance to blacklist each of them too.
    const sessions = await db.session.findMany({ where: { userId }, select: { id: true } });

    await runAsActor(user, async () => {
      await lucia.invalidateUserSessions(userId);
    });
    await Promise.all(sessions.map((s) => blacklistSession(s.id)));
    return null;
  });
}
