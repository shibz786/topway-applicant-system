import { z } from "zod";
import { permissionsSchema } from "@/lib/permissions";

// Shared between the staff create/edit form (client) and the Server Action
// (server) — same schema validates both, per CLAUDE.md.
const usernamePattern = /^[a-z0-9._-]+$/;

export const createStaffSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "At least 3 characters")
    .max(50)
    .regex(usernamePattern, "Lowercase letters, numbers, dots, underscores, hyphens only"),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters").max(200),
  permissions: permissionsSchema,
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;

export const updateStaffSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.email("Enter a valid email"),
  password: z.union([z.literal(""), z.string().min(8, "At least 8 characters").max(200)]).optional(),
  permissions: permissionsSchema,
  isActive: z.boolean(),
});

export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
