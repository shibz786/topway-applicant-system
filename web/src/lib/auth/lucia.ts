import { Lucia, TimeSpan } from "lucia";
import { PrismaAdapter } from "@lucia-auth/adapter-prisma";
import { db } from "@/lib/db";
import type { Role } from "@prisma/client";

const adapter = new PrismaAdapter(db.session, db.user);

export const lucia = new Lucia(adapter, {
  // 48h expiry with sliding refresh — Lucia refreshes automatically once
  // less than half the session's lifetime remains (see middleware.ts).
  sessionExpiresIn: new TimeSpan(48, "h"),
  sessionCookie: {
    name: "topway_session",
    expires: false, // session cookie; the DB row is the real expiry authority
    attributes: {
      // Never send the session token anywhere but an httpOnly cookie.
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  },
  getUserAttributes: (attributes) => ({
    name: attributes.name,
    username: attributes.username,
    email: attributes.email,
    role: attributes.role,
    permissions: attributes.permissions,
    isActive: attributes.isActive,
  }),
});

declare module "lucia" {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: {
      name: string;
      username: string;
      email: string;
      role: Role;
      permissions: unknown;
      isActive: boolean;
    };
  }
}
