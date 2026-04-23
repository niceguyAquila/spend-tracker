import { z } from "zod";

export const bigBookCurrencySchema = z.enum(["IDR", "MYR", "USDT", "TRX"]);
export const bigBookEntryDirectionSchema = z.enum(["spending", "profit"]);

export const bigBookTypeCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Z0-9_]+$/, "Code must use uppercase letters, numbers, and underscores."),
  name: z.string().trim().min(2).max(100),
  sort_order: z.coerce.number().int().min(0).max(9999).optional()
});

export const bigBookTypeUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(100).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).max(9999).optional()
});

export const bigBookActorUpdateSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().trim().min(2).max(100).optional(),
  user_id: z.string().uuid().nullable().optional()
});

export const bigBookEntryInputSchema = z.object({
  entry_date: z.string().min(1, "Date is required"),
  entry_direction: bigBookEntryDirectionSchema,
  entry_type_id: z.string().uuid("Type is required"),
  explanation: z.string().trim().min(2).max(500),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  currency_code: bigBookCurrencySchema,
  remark: z.string().max(1000).optional().or(z.literal("")),
  responsible_actor_id: z.string().uuid("Responsible actor is required")
});

export const bigBookEntryUpdateSchema = bigBookEntryInputSchema.extend({
  id: z.string().uuid()
});

export const bigBookAttachmentCreateSchema = z.object({
  ledger_entry_id: z.string().uuid(),
  storage_path: z.string().trim().min(5).max(512),
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(3).max(120),
  file_size: z.coerce.number().int().positive().max(5 * 1024 * 1024)
});

export const bigBookAttachmentDeleteSchema = z.object({
  id: z.string().uuid()
});

export const bigBookAttachmentViewSchema = z.object({
  id: z.string().uuid()
});
