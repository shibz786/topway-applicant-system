"use server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/auth/session";
import { companySettingsSchema, type CompanySettingsInput } from "@/lib/validation/invoice";
import { runAction, ActionError, type ActionResult } from "./result";

const SINGLETON_ID = "singleton";

export type CompanySettingsData = Awaited<ReturnType<typeof getCompanySettingsInternal>>;

async function getCompanySettingsInternal() {
  const existing = await db.companySettings.findUnique({ where: { id: SINGLETON_ID } });
  return (
    existing ?? {
      id: SINGLETON_ID,
      bankName: null,
      accountNo: null,
      accountName: null,
      swiftCode: null,
      email: null,
      phone: null,
      fax: null,
      address: null,
      website: null,
      updatedAt: new Date(0),
    }
  );
}

// Readable by anyone who can reach the invoicing portal (they need it to
// see bank details on a PDF); editable by admin only, per CLAUDE.md
// ("Bank details ... editable by admin only").
export async function getCompanySettings(): Promise<ActionResult<CompanySettingsData>> {
  return runAction(async () => {
    await requireSession();
    return getCompanySettingsInternal();
  });
}

export async function updateCompanySettings(input: CompanySettingsInput): Promise<ActionResult<null>> {
  return runAction(async () => {
    await requireSession({ role: "ADMIN" });

    const parsed = companySettingsSchema.safeParse(input);
    if (!parsed.success) throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const data = parsed.data;

    await db.companySettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...data },
      update: data,
    });
    return null;
  });
}
