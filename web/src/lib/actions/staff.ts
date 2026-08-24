"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { createStaffSchema, updateStaffSchema, type CreateStaffInput, type UpdateStaffInput } from "@/lib/validation/staff";
import { runAction, ActionError, type ActionResult } from "./result";

// Staff management is admin-only end to end (CLAUDE.md permissions table:
// "Manage staff accounts + permissions — Admin only"). No permission flag
// covers this — requireSession({ role: "ADMIN" }) is the whole gate.

export type StaffRow = Awaited<ReturnType<typeof listStaffInternal>>[number];

async function listStaffInternal() {
  return db.user.findMany({
    where: { role: "STAFF" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      username: true,
      email: true,
      permissions: true,
      isActive: true,
      createdAt: true,
    },
  });
}

export async function listStaff(): Promise<ActionResult<StaffRow[]>> {
  return runAction(async () => {
    await requireSession({ role: "ADMIN" });
    return listStaffInternal();
  });
}

export async function createStaff(input: CreateStaffInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    await requireSession({ role: "ADMIN" });

    const parsed = createStaffSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const data = parsed.data;

    const existing = await db.user.findFirst({
      where: { OR: [{ username: data.username }, { email: data.email }] },
    });
    if (existing) throw new ActionError("Username or email already in use");

    const user = await db.user.create({
      data: {
        name: data.name,
        username: data.username,
        email: data.email,
        passwordHash: await hashPassword(data.password),
        role: "STAFF",
        permissions: data.permissions,
      },
    });
    return { id: user.id };
  });
}

export async function updateStaff(input: UpdateStaffInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireSession({ role: "ADMIN" });

    const parsed = updateStaffSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const data = parsed.data;

    const target = await db.user.findUnique({ where: { id: data.id } });
    if (!target || target.role !== "STAFF") throw new ActionError("Staff member not found");

    const existing = await db.user.findFirst({
      where: { email: data.email, NOT: { id: data.id } },
    });
    if (existing) throw new ActionError("Email already in use");

    await db.user.update({
      where: { id: data.id },
      data: {
        name: data.name,
        email: data.email,
        permissions: data.permissions,
        isActive: data.isActive,
        ...(data.password ? { passwordHash: await hashPassword(data.password) } : {}),
      },
    });
    return null;
  });
}
