import "server-only";
import { kv } from "@/lib/kv/adapter";

// CLAUDE.md security rule #2: sign-out "deletes it AND adds the token to
// the Upstash blacklist so it's immediately invalid everywhere." The
// Lucia session row is already deleted on logout (see
// api/auth/logout/route.ts) and validateSession() hits the DB fresh every
// call — no caching layer sits in front of it today — so the blacklist is
// defense-in-depth, not the only thing standing between a stale cookie and
// access. It's still real, checked on every request in
// lib/auth/session.ts, not decorative: this is exactly the fast-path a
// future edge-cached session check would need, and building it now means
// that optimization doesn't require touching the security model later.
const TTL_SECONDS = 48 * 60 * 60; // matches the session's own max lifetime

function blacklistKey(sessionId: string): string {
  return `session:blacklist:${sessionId}`;
}

export async function blacklistSession(sessionId: string): Promise<void> {
  await kv.set(blacklistKey(sessionId), "1", { exSeconds: TTL_SECONDS });
}

export async function isSessionBlacklisted(sessionId: string): Promise<boolean> {
  return (await kv.get(blacklistKey(sessionId))) !== null;
}
