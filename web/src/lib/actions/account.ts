"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { requireSession, runAsActor } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { lucia } from "@/lib/auth/lucia";
import { blacklistSession } from "@/lib/kv/session-blacklist";
import { changePasswordSchema, type ChangePasswordInput } from "@/lib/validation/account";
import { runAction, ActionError, type ActionResult } from "./result";

// A2 bug fix: there was no self-service "change/reset my password"
// anywhere — admin could reset an AGENT's password from /admin/agents
// (updateAgent already supported it), but an agent themselves, or staff,
// or admin, had no way to change their own. Available to every signed-in
// user regardless of role, same "self-service regardless of role" pattern
// as MySessionsCard/listSessionsForUser.
export async function changeOwnPassword(input: ChangePasswordInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();

    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const { currentPassword, newPassword } = parsed.data;

    const dbUser = await db.user.findUnique({ where: { id: user.id } });
    if (!dbUser) throw new ActionError("Account not found");

    const currentOk = await verifyPassword(dbUser.passwordHash, currentPassword);
    if (!currentOk) throw new ActionError("Current password is incorrect");

    const newPasswordHash = await hashPassword(newPassword);
    await runAsActor(user, () => db.user.update({ where: { id: user.id }, data: { passwordHash: newPasswordHash } }));

    // A password change is exactly the moment any stolen/stale session
    // elsewhere should stop working — every session for this account
    // (including the one making this request) is invalidated and
    // blacklisted, then a brand new session + cookie is issued below so
    // the browser making this request stays logged in.
    const sessions = await db.session.findMany({ where: { userId: user.id }, select: { id: true } });
    await runAsActor(user, () => lucia.invalidateUserSessions(user.id));
    await Promise.all(sessions.map((s) => blacklistSession(s.id)));

    const newSession = await runAsActor(user, () => lucia.createSession(user.id, {}));
    const sessionCookie = lucia.createSessionCookie(newSession.id);
    const cookieStore = await cookies();
    cookieStore.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

    return null;
  });
}
