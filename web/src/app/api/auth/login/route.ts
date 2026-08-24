import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { lucia } from "@/lib/auth/lucia";
import { verifyPassword } from "@/lib/auth/password";
import { loginSchema } from "@/lib/validation/auth";
import { checkLoginRateLimit, recordLoginResult } from "@/lib/rate-limit/login-rate-limit";
import { currentIp } from "@/lib/auth/session";

// The ONE public route in this app (CLAUDE.md rule #1). Every other Route
// Handler and Server Action must call requireSession() before doing
// anything else.

const GENERIC_ERROR = { ok: false, error: "Invalid username or password" } as const;
const RATE_LIMIT_ERROR = { ok: false, error: "Too many attempts. Please try again later." } as const;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    // Still a generic 401, not a 400 with field errors — don't help an
    // attacker distinguish "bad shape" from "bad credentials".
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  const { username, password } = parsed.data;
  const normalized = username.toLowerCase();
  const ip = await currentIp();

  // CLAUDE.md rule #5: 10 attempts/IP/15min, 5 consecutive fails on one
  // username locks it for 15min + an email alert. Checked BEFORE touching
  // credentials — never reveals which check failed, same generic response
  // either way.
  const rateLimit = await checkLoginRateLimit("app", ip, normalized);
  if (!rateLimit.allowed) {
    return NextResponse.json(RATE_LIMIT_ERROR, { status: 429 });
  }

  const user = await db.user.findUnique({ where: { username: normalized } });

  // Always run verifyPassword, even against a dummy hash, so a nonexistent
  // username doesn't respond measurably faster than a real one with a
  // wrong password — timing shouldn't leak whether the account exists any
  // more than the generic error message does.
  const DUMMY_HASH =
    "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const passwordOk = await verifyPassword(user?.passwordHash ?? DUMMY_HASH, password);
  const success = !!user && passwordOk && user.isActive;

  await recordLoginResult("app", normalized, success, user?.email);

  if (!user || !success) {
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  const session = await lucia.createSession(user.id, {});
  const sessionCookie = lucia.createSessionCookie(session.id);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

  return NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, username: user.username, role: user.role },
  });
}
