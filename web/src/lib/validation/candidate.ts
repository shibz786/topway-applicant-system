import { z } from "zod";

// WorkerCategory display labels, exactly as specified: "First Timer" (not
// "Inexperienced"), "Experienced", "Contracted". See
// business/tracking.ts:WORKER_CATEGORY_LABELS for the label map — this
// schema only constrains the enum values themselves.
export const workerCategorySchema = z.enum(["FIRST_TIMER", "EXPERIENCED", "CONTRACTED"]);

export const MARITAL_STATUS_OPTIONS = ["Single", "Married", "Divorced", "Widowed"] as const;

// react-hook-form's `valueAsNumber: true` turns an empty number input into
// NaN, not undefined — this normalizes that to undefined before the
// underlying schema's own min/max checks ever see it, without changing
// the schema's input/output type (z.preprocess's input type is `unknown`,
// which zodResolver handles fine; z.coerce would instead change the
// OUTPUT type and break the useForm<T> generic match, the issue this
// sidesteps).
function nanToUndefined<T extends z.ZodTypeAny>(schema: T): T {
  return z.preprocess((v) => (typeof v === "number" && Number.isNaN(v) ? undefined : v), schema) as unknown as T;
}

// Step 1 — personal details. The height/weight/maritalStatus/children/
// passport-issue/education fields were added for the A1 bug fix (see the
// schema.prisma comment on Candidate) - all optional since they're new and
// no existing candidate has a value yet, but validated properly whenever a
// value IS given rather than accepted as free-form text.
// The base object (no .refine() yet) - kept separate so candidateSchema
// below can still .extend() it; a refined (ZodEffects) schema can't be
// extended, only re-refined.
export const personalDetailsObjectSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(200),
  nationality: z.string().trim().min(1, "Nationality is required").max(100),
  dateOfBirth: z.string().min(1, "Date of birth is required"), // yyyy-mm-dd
  passportNumber: z.string().trim().min(1, "Passport number is required").max(50),
  passportExpiry: z.string().min(1, "Passport expiry is required"), // yyyy-mm-dd
  idNumber: z.string().trim().max(50).optional(),
  phone: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional(),
  religion: z.string().trim().max(100).optional(),
  // Plain z.number() (not z.coerce.number()) deliberately — react-hook-
  // form's `valueAsNumber: true` already gives a real number (or NaN for
  // an empty field) at the DOM layer, matching this codebase's existing
  // pattern (see workExperienceEntrySchema.years below). z.coerce here
  // would make the schema's INPUT type differ from its OUTPUT type, which
  // breaks zodResolver's generic against useForm<PersonalDetailsInput>.
  // nanToUndefined turns the empty-field NaN into "not provided".
  heightCm: nanToUndefined(z.number().int().min(50, "Enter a height in cm").max(250).optional()),
  weightKg: nanToUndefined(z.number().int().min(20, "Enter a weight in kg").max(300).optional()),
  maritalStatus: z.union([z.literal(""), z.enum(MARITAL_STATUS_OPTIONS)]).optional(),
  childrenCount: nanToUndefined(z.number().int().min(0).max(30).optional()),
  passportIssueDate: z.union([z.literal(""), z.string()]).optional(), // yyyy-mm-dd, must be before expiry (checked below)
  passportIssuePlace: z.string().trim().max(200).optional(),
  educationGrade: z.string().trim().max(100).optional(),
  educationYear: nanToUndefined(z.number().int().min(1950, "Enter a 4-digit year").max(2100).optional()),
});

const passportIssueBeforeExpiry = (data: { passportIssueDate?: string | ""; passportExpiry: string }) => {
  if (!data.passportIssueDate) return true;
  return new Date(data.passportIssueDate) < new Date(data.passportExpiry);
};
const passportIssueRefineOpts = {
  message: "Passport date of issue must be before the expiry date",
  path: ["passportIssueDate"],
};

export const personalDetailsSchema = personalDetailsObjectSchema.refine(
  passportIssueBeforeExpiry,
  passportIssueRefineOpts,
);
export type PersonalDetailsInput = z.infer<typeof personalDetailsSchema>;

// A single prior overseas placement — country worked in is the field the
// CV actually needs to show; role/years are supporting detail. Real work
// history, not a legacy field (see the WorkExperience model comment in
// schema.prisma for why this is new, not migrated).
export const workExperienceEntrySchema = z.object({
  id: z.string().optional(), // present when editing an existing entry
  country: z.string().trim().min(1, "Country is required").max(100),
  role: z.string().trim().max(100).optional(),
  years: z.number().int().min(0).max(40),
});

// Step 2 — experience & skills.
export const experienceSkillsSchema = z.object({
  category: workerCategorySchema,
  skills: z.array(z.string()),
  languages: z.array(z.string()),
  yearsExperience: z.number().int().min(0).max(60),
  contractDuration: z.number().int().min(1).max(120), // months, typically 24
  workHistory: z.array(workExperienceEntrySchema),
});
export type ExperienceSkillsInput = z.infer<typeof experienceSkillsSchema>;

// Full record — same shape used by the Server Action (create/update) and
// composed from the two step schemas above on the client. Extends the
// unrefined base object (a refined ZodEffects can't be .extend()ed), then
// re-applies the same passport-issue-date-before-expiry rule.
export const candidateSchema = personalDetailsObjectSchema
  .extend(experienceSkillsSchema.shape)
  .refine(passportIssueBeforeExpiry, passportIssueRefineOpts);
export type CandidateInput = z.infer<typeof candidateSchema>;

export const SKILL_OPTIONS = ["Cleaning", "Washing", "Babysitting", "Cooking", "Driving"];
export const LANGUAGE_OPTIONS = ["English", "Arabic", "Hindi", "Tamil", "Sinhala", "Tagalog"];
