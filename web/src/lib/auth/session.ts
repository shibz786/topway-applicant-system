import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { Session } from "lucia";
import { lucia } from "./lucia";
import { db, actorContext } from "@/lib/db";
import { parsePermissions, type Permissions } from "@/lib/permissions";
import { isSessionBlacklisted } from "@/lib/kv/session-blacklist";
import type { Role } from "@prisma/client";

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  role: Role;
  permissions: Permissions;
  agentId: string | null; // set only for role === "AGENT"
  agentDataBankAccess: boolean; // set only for role === "AGENT"; false otherwise
};

type ValidateResult =
  | { session: Session; user: SessionUser }
  | { session: null; user: null };

// The ONE place session cookies get read/validated. Every Route Handler and
// Server Action goes through requireSession() below, which calls this —
// never re-implement cookie/session validation inline elsewhere.
//
// cache() de-dupes repeat calls within a single request/render pass.
export const validateRequest = cache(async (): Promise<ValidateResult> => {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(lucia.sessionCookieName)?.value ?? null;
  if (!sessionId) return { session: null, user: null };

  // Checked before the DB round trip — CLAUDE.md rule #2's blacklist is
  // meant to be a fast rejection path, so it needs to run first, not
  // alongside. Session deletion (see logout/revoke actions) is still the
  // authoritative source of truth; this just short-circuits it.
  if (await isSessionBlacklisted(sessionId)) {
    return { session: null, user: null };
  }

  const result = await lucia.validateSession(sessionId);

  // Sliding refresh: Lucia tells us when the cookie needs re-issuing.
  try {
    if (result.session && result.session.fresh) {
      const sessionCookie = lucia.createSessionCookie(result.session.id);
      cookieStore.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
    }
    if (!result.session) {
      const sessionCookie = lucia.createBlankSessionCookie();
      cookieStore.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
    }
  } catch {
    // cookies() is read-only in some contexts (e.g. certain RSC render
    // paths) — that's fine, middleware.ts covers the refresh there.
  }

  if (!result.session || !result.user) return { session: null, user: null };

  if (!result.user.isActive) {
    await lucia.invalidateSession(result.session.id);
    return { session: null, user: null };
  }

  let agentId: string | null = null;
  let agentDataBankAccess = false;
  if (result.user.role === "AGENT") {
    const agent = await db.agent.findUnique({
      where: { userId: result.user.id },
      select: { id: true, dataBankAccess: true },
    });
    agentId = agent?.id ?? null;
    agentDataBankAccess = agent?.dataBankAccess ?? false;
  }

  return {
    session: result.session,
    user: {
      id: result.user.id,
      name: result.user.name,
      username: result.user.username,
      email: result.user.email,
      role: result.user.role,
      permissions: parsePermissions(result.user.permissions),
      agentId,
      agentDataBankAccess,
    },
  };
});

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

type RequireSessionOptions = {
  /** Restrict to one or more roles. Omit to allow any authenticated role. */
  role?: Role | Role[];
};

// requireSession(role?) — call this at the top of every Route Handler and
// every Server Action that touches data. There are zero public endpoints
// except /api/auth/login (CLAUDE.md rule #1). Throws UnauthorizedError (no
// session) or ForbiddenError (wrong role) — callers map those to 401/403.
//
// Also binds the actor into AsyncLocalStorage for the duration of the
// caller's work so the Prisma audit middleware (see db.ts) knows who to
// attribute writes to. Always run mutations inside the callback form:
//
//   const user = await requireSession();
//   return runAsActor(user, () => db.candidate.update(...));
export async function requireSession(options?: RequireSessionOptions): Promise<SessionUser> {
  const { user } = await validateRequest();
  if (!user) throw new UnauthorizedError();

  if (options?.role) {
    const allowed = Array.isArray(options.role) ? options.role : [options.role];
    if (!allowed.includes(user.role)) throw new ForbiddenError();
  }

  return user;
}

// The `async () => { return await fn(); }` wrapper is deliberate, not
// stylistic — `actorContext.run(store, () => fn())` (returning the
// un-awaited promise) measurably loses the AsyncLocalStorage store by the
// time Prisma's $use middleware (db.ts) actually dispatches the query:
// Node only keeps the store bound for the synchronous extent of the
// callback, and Prisma's query dispatch happens on a later tick that
// wasn't staying linked to it. Awaiting inside the callback keeps the
// store's "active" extent open across that gap. Confirmed by instrumenting
// both sides live — do not simplify this back to a bare `return fn()`.
export async function runAsActor<T>(user: SessionUser, fn: () => Promise<T>): Promise<T> {
  return actorContext.run({ actorId: user.id }, async () => {
    return await fn();
  });
}

// Convenience for Route Handlers: requireSession() + runAsActor() in one
// call, with request metadata available for anything that wants it.
export async function requireSessionForRequest(
  options?: RequireSessionOptions,
): Promise<{ user: SessionUser; run: <T>(fn: () => Promise<T>) => Promise<T> }> {
  const user = await requireSession(options);
  return { user, run: (fn) => runAsActor(user, fn) };
}

export async function currentIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return h.get("x-real-ip") ?? "0.0.0.0";
}
