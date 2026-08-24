import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { lucia } from "@/lib/auth/lucia";
import { blacklistSession } from "@/lib/kv/session-blacklist";

// Deliberately not gated behind requireSession(): logging out only ever
// acts on the caller's own session cookie, never on protected data, so
// there's nothing here for an unauthenticated caller to gain — and the
// client needs to be able to call this even when its session has already
// expired, to clear a stale cookie.
//
// Sign-out deletes the session row immediately (CLAUDE.md rule #2) — Lucia
// re-validates against the DB on every request, so this alone makes the
// token invalid everywhere right away. The blacklist add below is
// defense-in-depth on top of that, not a substitute for it — see the
// comment in lib/kv/session-blacklist.ts.
export async function POST() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(lucia.sessionCookieName)?.value ?? null;

  if (sessionId) {
    await lucia.invalidateSession(sessionId);
    await blacklistSession(sessionId);
  }

  const blankCookie = lucia.createBlankSessionCookie();
  cookieStore.set(blankCookie.name, blankCookie.value, blankCookie.attributes);

  return NextResponse.json({ ok: true });
}
