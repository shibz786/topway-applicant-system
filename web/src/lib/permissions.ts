import { z } from "zod";

// Staff permission flags — booleans per section, checked server-side on
// every action per CLAUDE.md rule #10. Never trust a client-supplied copy
// of this object; always read it fresh from the session's user record.
// Deliberately no .default() here — with Zod v4 + react-hook-form, a
// default() makes the schema's input/output types diverge (optional vs.
// required), which breaks zodResolver's generic inference. Every caller
// already passes a complete permissions object (NO_PERMISSIONS,
// ALL_PERMISSIONS, or a DB row that always has all 5 keys), so requiring
// them here costs nothing.
export const permissionsSchema = z.object({
  applications: z.boolean(),
  databank: z.boolean(),
  invoices: z.boolean(),
  agents: z.boolean(),
  tracking: z.boolean(),
});

export type Permissions = z.infer<typeof permissionsSchema>;

export const NO_PERMISSIONS: Permissions = {
  applications: false,
  databank: false,
  invoices: false,
  agents: false,
  tracking: false,
};

export const ALL_PERMISSIONS: Permissions = {
  applications: true,
  databank: true,
  invoices: true,
  agents: true,
  tracking: true,
};

export function parsePermissions(raw: unknown): Permissions {
  const result = permissionsSchema.safeParse(raw);
  return result.success ? result.data : NO_PERMISSIONS;
}
