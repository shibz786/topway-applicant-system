"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { runAction, type ActionResult } from "./result";

// First-time user guidance: a persisted per-user flag (see the User.
// hasSeenOnboarding comment in schema.prisma for why not localStorage).
export async function markOnboardingSeen(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireSession();
    // User isn't an audited model (not in the 5 listed tables) - no actor
    // context needed for this write, same as Document's own writes.
    await db.user.update({ where: { id: user.id }, data: { hasSeenOnboarding: true } });
    return null;
  });
}
