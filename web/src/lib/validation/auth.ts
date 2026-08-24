import { z } from "zod";

// Shared between the login form (client validation) and the login route
// (server-side parsing) — CLAUDE.md: "the same schema validates the Server
// Action input server-side."
export const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required").max(200),
  password: z.string().min(1, "Password is required").max(200),
});

export type LoginInput = z.infer<typeof loginSchema>;
