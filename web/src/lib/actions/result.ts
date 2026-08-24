import "server-only";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/session";

// Server Actions in this app return this shape instead of throwing across
// the server/client boundary, so client mutation code (TanStack Query
// onError, etc.) always has a predictable { ok, error } to branch on.
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Throw this from inside an action for an error message that's safe to
// show the user verbatim (bad input, a business-rule violation, "not
// found"). Anything else thrown gets logged server-side and replaced with
// a generic message — never leak raw internals to the client.
export class ActionError extends Error {}

export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (err) {
    if (err instanceof UnauthorizedError) return { ok: false, error: "Unauthorized" };
    if (err instanceof ForbiddenError) return { ok: false, error: err.message || "Forbidden" };
    if (err instanceof ActionError) return { ok: false, error: err.message };
    console.error(err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
