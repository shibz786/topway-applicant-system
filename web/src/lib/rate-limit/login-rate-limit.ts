import "server-only";
import { kv } from "@/lib/kv/adapter";
import { email } from "@/lib/email/adapter";

// CLAUDE.md security rule #5: 10 attempts/IP/15min, 5 consecutive failures
// on one username locks that username for 15min + an email alert. Same
// policy as the Phase 0 PHP stopgap (api/_lib.php's
// enforce_login_rate_limit), reimplemented natively here against the KV
// abstraction instead of a JSON file. Never reveals whether a username
// exists — callers return the same generic 401 either way regardless of
// which check failed.

const WINDOW_SECONDS = 15 * 60;
const IP_MAX_ATTEMPTS = 10;
const USERNAME_MAX_FAILS = 5;

function ipKey(scope: string, ip: string): string {
  return `login:ip:${scope}:${ip}`;
}
function failsKey(scope: string, username: string): string {
  return `login:fails:${scope}:${username.toLowerCase()}`;
}
function lockKey(scope: string, username: string): string {
  return `login:locked:${scope}:${username.toLowerCase()}`;
}

export type RateLimitCheck = { allowed: true } | { allowed: false; reason: "ip" | "locked" };

// Call BEFORE verifying credentials.
export async function checkLoginRateLimit(scope: string, ip: string, username: string): Promise<RateLimitCheck> {
  const ipCount = await kv.incr(ipKey(scope, ip));
  if (ipCount === 1) await kv.expire(ipKey(scope, ip), WINDOW_SECONDS);
  if (ipCount > IP_MAX_ATTEMPTS) return { allowed: false, reason: "ip" };

  const locked = await kv.get(lockKey(scope, username));
  if (locked) return { allowed: false, reason: "locked" };

  return { allowed: true };
}

// Call AFTER verifying credentials, regardless of outcome.
export async function recordLoginResult(
  scope: string,
  username: string,
  success: boolean,
  alertEmail?: string,
): Promise<void> {
  if (success) {
    await kv.del(failsKey(scope, username));
    return;
  }

  const fails = await kv.incr(failsKey(scope, username));
  if (fails === 1) await kv.expire(failsKey(scope, username), WINDOW_SECONDS);

  if (fails >= USERNAME_MAX_FAILS) {
    await kv.set(lockKey(scope, username), "1", { exSeconds: WINDOW_SECONDS });
    await kv.del(failsKey(scope, username));

    if (alertEmail) {
      await email.send({
        to: alertEmail,
        subject: "Account temporarily locked: repeated failed sign-in attempts",
        body:
          `Your ${scope} account (${username}) was locked for 15 minutes after ${USERNAME_MAX_FAILS} ` +
          `consecutive failed sign-in attempts. If this wasn't you, consider changing your password ` +
          `once the lock expires.`,
      });
    }
  }
}
