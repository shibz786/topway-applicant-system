import { ForbiddenError, type SessionUser } from "./session";
import type { Permissions } from "@/lib/permissions";

// CLAUDE.md rule #10 + #4: permission checks are on the ACTION, server-side,
// every time — never just "is this route reachable". Admin always passes;
// everyone else needs the specific flag. Call this inside every Server
// Action / Route Handler that touches a permission-gated section, right
// after requireSession().
export function requirePermission(user: SessionUser, flag: keyof Permissions): void {
  if (user.role === "ADMIN") return;
  if (user.permissions[flag]) return;
  throw new ForbiddenError(`Missing permission: ${flag}`);
}
