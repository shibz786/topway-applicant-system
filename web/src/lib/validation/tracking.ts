import { z } from "zod";
import { PIPELINE_STEPS } from "@/lib/business/tracking";

const pipelineKeys = PIPELINE_STEPS.map((s) => s.key) as [string, ...string[]];

export const setPipelineDateSchema = z.object({
  candidateId: z.string().min(1),
  step: z.enum(pipelineKeys),
  date: z.string().nullable(), // yyyy-mm-dd, or null to clear
});
export type SetPipelineDateInput = z.infer<typeof setPipelineDateSchema>;

// Departure date + destination country must always be set together —
// CLAUDE.md: "Block saving one without the other." Both required here
// (not independently optional) so that invariant can never be bypassed by
// calling this with only one of the two set.
export const setDepartureSchema = z.object({
  candidateId: z.string().min(1),
  departureDate: z.string().min(1, "Departure date is required"),
  destinationCountry: z.enum(["SAUDI_ARABIA", "KUWAIT", "OMAN", "QATAR"]),
});
export type SetDepartureInput = z.infer<typeof setDepartureSchema>;

export const putOnHoldSchema = z.object({
  candidateId: z.string().min(1),
  reason: z.string().trim().min(1, "A reason is required to put a candidate on hold").max(1000),
});
export type PutOnHoldInput = z.infer<typeof putOnHoldSchema>;

export const cancelApplicationSchema = z.object({
  candidateId: z.string().min(1),
});

export const resumeApplicationSchema = z.object({
  candidateId: z.string().min(1),
});

export const disputeTypeSchema = z.enum(["RUNAWAY", "REFUSAL_TO_WORK", "MEDICALLY_UNFIT", "OTHER"]);

export const createDisputeSchema = z.object({
  candidateId: z.string().min(1),
  type: disputeTypeSchema,
  notes: z.string().trim().max(2000).optional(),
});
export type CreateDisputeInput = z.infer<typeof createDisputeSchema>;

export const resolveDisputeSchema = z.object({
  disputeId: z.string().min(1),
});

export const updateTrackingNotesSchema = z.object({
  candidateId: z.string().min(1),
  notes: z.string().trim().max(5000).optional(),
});
