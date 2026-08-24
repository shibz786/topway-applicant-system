import { z } from "zod";

// WorkerCategory display labels, exactly as specified: "First Timer" (not
// "Inexperienced"), "Experienced", "Contracted". See
// business/tracking.ts:WORKER_CATEGORY_LABELS for the label map — this
// schema only constrains the enum values themselves.
export const workerCategorySchema = z.enum(["FIRST_TIMER", "EXPERIENCED", "CONTRACTED"]);

// Step 1 — personal details.
export const personalDetailsSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(200),
  nationality: z.string().trim().min(1, "Nationality is required").max(100),
  dateOfBirth: z.string().min(1, "Date of birth is required"), // yyyy-mm-dd
  passportNumber: z.string().trim().min(1, "Passport number is required").max(50),
  passportExpiry: z.string().min(1, "Passport expiry is required"), // yyyy-mm-dd
  idNumber: z.string().trim().max(50).optional(),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional(),
  religion: z.string().trim().max(100).optional(),
});
export type PersonalDetailsInput = z.infer<typeof personalDetailsSchema>;

// Step 2 — experience & skills.
export const experienceSkillsSchema = z.object({
  category: workerCategorySchema,
  skills: z.array(z.string()),
  languages: z.array(z.string()),
  yearsExperience: z.number().int().min(0).max(60),
  contractDuration: z.number().int().min(1).max(120), // months, typically 24
});
export type ExperienceSkillsInput = z.infer<typeof experienceSkillsSchema>;

// Full record — same shape used by the Server Action (create/update) and
// composed from the two step schemas above on the client.
export const candidateSchema = personalDetailsSchema.extend(experienceSkillsSchema.shape);
export type CandidateInput = z.infer<typeof candidateSchema>;

export const SKILL_OPTIONS = ["Cleaning", "Washing", "Babysitting", "Cooking", "Driving"];
export const LANGUAGE_OPTIONS = ["English", "Arabic", "Hindi", "Tamil", "Sinhala", "Tagalog"];
