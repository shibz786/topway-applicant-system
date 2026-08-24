import { z } from "zod";

const usernamePattern = /^[a-z0-9._-]+$/;

export const createAgentSchema = z.object({
  name: z.string().trim().min(1, "Contact name is required").max(200),
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  country: z.string().trim().min(1, "Country is required").max(100),
  licenseNo: z.string().trim().max(100).optional(),
  contactNo: z.string().trim().max(50).optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "At least 3 characters")
    .max(50)
    .regex(usernamePattern, "Lowercase letters, numbers, dots, underscores, hyphens only"),
  email: z.email("Enter a valid email"),
  password: z.string().min(8, "At least 8 characters").max(200),
  dataBankAccess: z.boolean(),
});
export type CreateAgentInput = z.infer<typeof createAgentSchema>;

export const updateAgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "Contact name is required").max(200),
  companyName: z.string().trim().min(1, "Company name is required").max(200),
  country: z.string().trim().min(1, "Country is required").max(100),
  licenseNo: z.string().trim().max(100).optional(),
  contactNo: z.string().trim().max(50).optional(),
  email: z.email("Enter a valid email"),
  password: z.union([z.literal(""), z.string().min(8, "At least 8 characters").max(200)]).optional(),
  dataBankAccess: z.boolean(),
  isActive: z.boolean(),
});
export type UpdateAgentInput = z.infer<typeof updateAgentSchema>;

export const assignCandidateSchema = z.object({
  candidateId: z.string().min(1),
  agentId: z.string().min(1),
});

// "Change of employer/house": closes the current Placement (endDate,
// isCurrent=false, changeReason), opens a new one — optionally granting the
// FORMER agent dual-visibility via remarketingDate on the closed Placement.
export const changeEmployerSchema = z.object({
  candidateId: z.string().min(1),
  newAgentId: z.string().min(1),
  changeReason: z.string().trim().min(1, "A reason is required").max(1000),
  employerName: z.string().trim().max(200).optional(),
  grantRemarketing: z.boolean(),
});
export type ChangeEmployerInput = z.infer<typeof changeEmployerSchema>;
