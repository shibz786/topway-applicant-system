import { z } from "zod";

// Matches the status workflow in CLAUDE.md: Draft -> Sent -> Paid -> Void.
// Invoice.status is a plain String column in Prisma (not an enum, per the
// schema as specified) — this is the app-level source of truth for which
// strings are valid.
export const INVOICE_STATUSES = ["DRAFT", "SENT", "PAID", "VOID"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// Forward-only workflow, plus VOID reachable from any non-terminal state.
export const ALLOWED_STATUS_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: ["SENT", "VOID"],
  SENT: ["PAID", "VOID"],
  PAID: ["VOID"],
  VOID: [],
};

// Plain z.number() (not z.coerce.number()) so the schema's input and output
// types match exactly — coerce's input type is `unknown`, which breaks
// zodResolver's generic inference the same way .default() does (see
// permissions.ts). The number inputs below use RHF's valueAsNumber option
// to do the string->number conversion before validation instead.
const invoiceItemSchema = z.object({
  id: z.string().optional(), // present when editing an existing item
  candidateId: z.string().nullable().optional(),
  description: z.string().trim().min(1, "Description is required").max(500),
  amount: z.number().nonnegative("Must be 0 or more"),
  quantity: z.number().int().min(1, "At least 1"),
});

export const invoiceFormSchema = z.object({
  agentId: z.string().nullable().optional(),
  currency: z.string().trim().min(1).max(10),
  notes: z.string().trim().max(5000).optional(),
  issuedAt: z.string().optional(), // yyyy-mm-dd from a date input
  dueAt: z.string().optional(),
  items: z.array(invoiceItemSchema).min(1, "At least one line item is required"),
});

export type InvoiceFormInput = z.infer<typeof invoiceFormSchema>;

export const setInvoiceStatusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(INVOICE_STATUSES),
});

export const companySettingsSchema = z.object({
  bankName: z.string().trim().max(200).optional(),
  accountNo: z.string().trim().max(100).optional(),
  accountName: z.string().trim().max(200).optional(),
  swiftCode: z.string().trim().max(50).optional(),
  email: z.union([z.literal(""), z.email()]).optional(),
  phone: z.string().trim().max(50).optional(),
  fax: z.string().trim().max(50).optional(),
  address: z.string().trim().max(500).optional(),
  website: z.string().trim().max(200).optional(),
});

export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;
