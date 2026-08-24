import { NextResponse } from "next/server";
import { UnauthorizedError, ForbiddenError } from "@/lib/auth/session";

// Every Route Handler should catch into this so requireSession()'s thrown
// errors map to the right status code consistently, instead of each route
// re-deciding what "unauthorized" looks like.
export function toErrorResponse(err: unknown): NextResponse {
  if (err instanceof UnauthorizedError) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (err instanceof ForbiddenError) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  console.error(err);
  return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
}
