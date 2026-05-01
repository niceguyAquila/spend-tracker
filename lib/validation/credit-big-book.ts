import { z } from "zod";

export const creditBookCurrencySchema = z.enum(["IDR", "MYR", "USDT", "TRX"]);
export type CreditBookCurrencyCode = z.infer<typeof creditBookCurrencySchema>;
export const creditBookEntryDirectionSchema = z.enum(["credit", "debt"]);

export const creditBookTypeCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Z0-9_]+$/, "Code must use uppercase letters, numbers, and underscores."),
  name: z.string().trim().min(2).max(100),
  sort_order: z.coerce.number().int().min(0).max(9999).optional()
});

export const creditBookTypeUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(100).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).max(9999).optional()
});

export const creditBookSubTypeCreateSchema = z.object({
  entry_type_id: z.string().uuid("Type is required"),
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Z0-9_]+$/, "Code must use uppercase letters, numbers, and underscores."),
  name: z.string().trim().min(2).max(100),
  sort_order: z.coerce.number().int().min(0).max(9999).optional()
});

export const creditBookSubTypeUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(100).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).max(9999).optional()
});

export const creditBookActorUpdateSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().trim().min(2).max(100).optional(),
  user_id: z.string().uuid().nullable().optional()
});

export const creditBookEntryInputSchema = z.object({
  entry_date: z.string().min(1, "Date is required"),
  entry_direction: creditBookEntryDirectionSchema,
  entry_type_id: z.string().uuid("Type is required"),
  entry_sub_type_id: z
    .string()
    .uuid("Sub-Type must be a valid id")
    .nullable()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value && value.length ? value : null)),
  explanation: z.string().trim().min(2).max(500),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  currency_code: creditBookCurrencySchema,
  remark: z.string().max(1000).optional().or(z.literal("")),
  responsible_actor_id: z.string().uuid("Responsible actor is required")
});

export const creditBookEntryUpdateSchema = creditBookEntryInputSchema.extend({
  id: z.string().uuid()
});

const optionalString = z
  .string()
  .trim()
  .min(1)
  .optional()
  .or(z.literal(""))
  .transform((value) => (value && value.length ? value : undefined));

function normalizeMultiSelect<T extends z.ZodTypeAny>(itemSchema: T) {
  return z
    .union([itemSchema, z.array(itemSchema), z.literal(""), z.array(z.literal(""))])
    .optional()
    .transform((value): z.infer<T>[] | undefined => {
      if (value === undefined || value === "") return undefined;
      const list: unknown[] = Array.isArray(value) ? value : [value];
      const normalized = list.filter(
        (item): item is z.infer<T> => item !== "" && item !== undefined && item !== null
      );
      if (!normalized.length) return undefined;
      return [...new Set(normalized)];
    });
}

export const creditBookEntriesQuerySchema = z.object({
  typeId: normalizeMultiSelect(z.string().uuid()),
  currencyCode: normalizeMultiSelect(creditBookCurrencySchema),
  direction: normalizeMultiSelect(creditBookEntryDirectionSchema),
  actorId: normalizeMultiSelect(z.string().uuid()),
  dateFrom: optionalString,
  dateTo: optionalString,
  query: z.string().max(200).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(200).default(20)
});

export type CreditBookEntriesQuery = z.infer<typeof creditBookEntriesQuerySchema>;

export const creditBookAttachmentCreateSchema = z.object({
  ledger_entry_id: z.string().uuid(),
  storage_path: z.string().trim().min(5).max(512),
  file_name: z.string().trim().min(1).max(255),
  mime_type: z.string().trim().min(3).max(120),
  file_size: z.coerce.number().int().positive().max(5 * 1024 * 1024)
});

export const creditBookAttachmentDeleteSchema = z.object({
  id: z.string().uuid()
});

export const creditBookAttachmentViewSchema = z.object({
  id: z.string().uuid()
});

export const creditBookExchangeRateQuerySchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  base_currency: creditBookCurrencySchema,
  quote_currency: creditBookCurrencySchema
});
