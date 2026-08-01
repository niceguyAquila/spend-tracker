import { z } from "zod";
import { entityCodeSchema, entityNameSchema, entitySortOrderSchema } from "@/lib/validation/entity-code";

export const bigBookCurrencySchema = z.enum(["IDR", "MYR", "USDT", "TRX"]);
export type BigBookCurrencyCode = z.infer<typeof bigBookCurrencySchema>;
export const bigBookEntryDirectionSchema = z.enum(["spending", "profit"]);

export const bigBookTypeCreateSchema = z.object({
  code: entityCodeSchema("Type code"),
  name: entityNameSchema("Type name"),
  sort_order: entitySortOrderSchema()
});

export const bigBookTypeUpdateSchema = z.object({
  id: z.string().uuid(),
  code: entityCodeSchema("Type code").optional(),
  name: entityNameSchema("Type name").optional(),
  is_active: z.boolean().optional(),
  sort_order: entitySortOrderSchema()
});

export const bigBookSubTypeCreateSchema = z.object({
  entry_type_id: z.string().uuid("Select a parent type."),
  code: entityCodeSchema("Sub-Type code"),
  name: entityNameSchema("Sub-Type name"),
  sort_order: entitySortOrderSchema()
});

export const bigBookSubTypeUpdateSchema = z.object({
  id: z.string().uuid(),
  code: entityCodeSchema("Sub-Type code").optional(),
  name: entityNameSchema("Sub-Type name").optional(),
  is_active: z.boolean().optional(),
  sort_order: entitySortOrderSchema()
});

export const bigBookVendorTypeCreateSchema = z.object({
  code: entityCodeSchema("Vendor Type code"),
  name: entityNameSchema("Vendor Type name"),
  sort_order: entitySortOrderSchema()
});

export const bigBookVendorTypeUpdateSchema = z.object({
  id: z.string().uuid(),
  code: entityCodeSchema("Vendor Type code").optional(),
  name: entityNameSchema("Vendor Type name").optional(),
  is_active: z.boolean().optional(),
  sort_order: entitySortOrderSchema()
});

export const bigBookActionByCreateSchema = z.object({
  code: entityCodeSchema("Action By code"),
  name: entityNameSchema("Action By name"),
  sort_order: entitySortOrderSchema()
});

export const bigBookActionByUpdateSchema = z.object({
  id: z.string().uuid(),
  code: entityCodeSchema("Action By code").optional(),
  name: entityNameSchema("Action By name").optional(),
  is_active: z.boolean().optional(),
  sort_order: entitySortOrderSchema()
});

export const bigBookVendorCreateSchema = z.object({
  vendor_type_id: z.string().uuid("Select a vendor type."),
  code: entityCodeSchema("Vendor code"),
  name: entityNameSchema("Vendor name"),
  sort_order: entitySortOrderSchema()
});

export const bigBookVendorUpdateSchema = z.object({
  id: z.string().uuid(),
  code: entityCodeSchema("Vendor code").optional(),
  name: entityNameSchema("Vendor name").optional(),
  is_active: z.boolean().optional(),
  sort_order: entitySortOrderSchema()
});

export const bigBookActorUpdateSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().trim().min(2).max(100).optional(),
  user_id: z.string().uuid().nullable().optional()
});

export const bigBookPocketCurrencySchema = z.enum(["IDR"]);
export type BigBookPocketCurrencyCode = z.infer<typeof bigBookPocketCurrencySchema>;

export const bigBookPocketCreateSchema = z.object({
  actor_id: z.string().uuid("Select an actor."),
  code: entityCodeSchema("Pocket code"),
  name: entityNameSchema("Pocket name"),
  currency_code: bigBookPocketCurrencySchema.default("IDR"),
  sort_order: entitySortOrderSchema()
});

export const bigBookPocketUpdateSchema = z.object({
  id: z.string().uuid(),
  code: entityCodeSchema("Pocket code").optional(),
  name: entityNameSchema("Pocket name").optional(),
  is_active: z.boolean().optional(),
  sort_order: entitySortOrderSchema()
});

const optionalUuidOrEmpty = (message: string) =>
  z
    .string()
    .uuid(message)
    .nullable()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value && value.length ? value : null));

export const bigBookCreditStatusSchema = z.enum(["open", "settled"]);
export const bigBookCreditFlagSchema = z.enum(["credit", "settlement", "none"]);

// The client sends `null` for notes that do not apply, so accept null/undefined/""
// interchangeably and normalize them all to null.
const optionalNoteSchema = z
  .string()
  .max(1000)
  .nullish()
  .transform((value) => (value && value.length ? value : null));

const bigBookEntryBaseSchema = z.object({
  entry_date: z.string().min(1, "Date is required"),
  entry_direction: bigBookEntryDirectionSchema,
  entry_type_id: z.string().uuid("Type is required"),
  entry_sub_type_id: optionalUuidOrEmpty("Sub-Type must be a valid id"),
  vendor_type_id: optionalUuidOrEmpty("Vendor Type must be a valid id"),
  vendor_id: optionalUuidOrEmpty("Vendor Name must be a valid id"),
  pocket_id: optionalUuidOrEmpty("Pocket must be a valid id"),
  action_by_id: optionalUuidOrEmpty("Action By must be a valid id"),
  explanation: z.string().trim().min(2).max(500),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  currency_code: bigBookCurrencySchema,
  remark: z.string().max(1000).optional().or(z.literal("")),
  responsible_actor_id: z.string().uuid("Responsible actor is required"),
  is_credit: z.boolean().optional().default(false),
  settles_entry_id: optionalUuidOrEmpty("Settlement target must be a valid id"),
  settlement_conversion_rate: z.coerce.number().positive().nullable().optional(),
  settlement_note: optionalNoteSchema,
  close_credit: z.boolean().optional().default(false),
  credit_settlement_note: optionalNoteSchema
});

function refineBigBookEntryCreditFields<
  T extends {
    is_credit?: boolean;
    settles_entry_id?: string | null;
    settlement_conversion_rate?: number | null;
    close_credit?: boolean;
  }
>(value: T, ctx: z.RefinementCtx) {
  if (value.is_credit && value.settles_entry_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A settlement entry cannot also be marked as credit.",
      path: ["is_credit"]
    });
  }
  if (value.settles_entry_id && value.settlement_conversion_rate == null) {
    // Conversion rate is required when linking a settlement; same-currency
    // settlements force rate = 1 in the API before insert.
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Conversion rate is required when settling a credit.",
      path: ["settlement_conversion_rate"]
    });
  }
  if (value.close_credit && !value.settles_entry_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Closing a credit requires a settlement target.",
      path: ["close_credit"]
    });
  }
}

export const bigBookEntryInputSchema = bigBookEntryBaseSchema.superRefine(refineBigBookEntryCreditFields);

export const bigBookEntryUpdateSchema = bigBookEntryBaseSchema
  .extend({
    id: z.string().uuid()
  })
  .superRefine(refineBigBookEntryCreditFields);

export const bigBookCreditSettleSchema = z.object({
  id: z.string().uuid(),
  settled: z.boolean(),
  note: optionalNoteSchema
});

const bigBookGroupEntryInputSchema = bigBookEntryBaseSchema.omit({
  is_credit: true,
  settles_entry_id: true,
  settlement_conversion_rate: true,
  settlement_note: true,
  close_credit: true,
  credit_settlement_note: true
});

export const bigBookGroupCreateSchema = z.object({
  label: z.string().trim().min(2).max(200),
  remark: z.string().max(1000).optional().or(z.literal("")),
  entries: z.array(bigBookGroupEntryInputSchema).min(2).max(50)
});

export const bigBookGroupEntryUpdateSchema = bigBookGroupEntryInputSchema.extend({
  id: z.string().uuid().optional()
});

export const bigBookGroupUpdateSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(2).max(200),
  remark: z.string().max(1000).optional().or(z.literal("")),
  entries: z.array(bigBookGroupEntryUpdateSchema).min(2).max(50)
});

export const bigBookGroupDeleteSchema = z.object({
  id: z.string().uuid(),
  mode: z.enum(["cascade", "ungroup"]).default("cascade")
});

export const bigBookGroupAssignSchema = z.object({
  label: z.string().trim().min(2).max(200),
  remark: z.string().max(1000).optional().or(z.literal("")),
  entry_ids: z
    .array(z.string().uuid())
    .min(2, "Select at least 2 transactions to group")
    .max(50)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate transaction ids")
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

export const bigBookLedgerSortKeySchema = z.enum([
  "entry_date",
  "entry_direction",
  "type_name",
  "sub_type_name",
  "vendor_type_name",
  "vendor_name",
  "explanation",
  "amount",
  "actor_display_name",
  "action_by_name",
  "pocket_name"
]);

export const bigBookLedgerSortDirSchema = z.enum(["asc", "desc"]);

export const bigBookEntriesQuerySchema = z.object({
  typeId: normalizeMultiSelect(z.string().uuid()),
  currencyCode: normalizeMultiSelect(bigBookCurrencySchema),
  direction: normalizeMultiSelect(bigBookEntryDirectionSchema),
  actorId: normalizeMultiSelect(z.string().uuid()),
  vendorTypeId: normalizeMultiSelect(z.string().uuid()),
  vendorId: normalizeMultiSelect(z.string().uuid()),
  pocketId: normalizeMultiSelect(z.string().uuid()),
  actionById: normalizeMultiSelect(z.string().uuid()),
  creditFlag: normalizeMultiSelect(bigBookCreditFlagSchema),
  creditStatus: normalizeMultiSelect(bigBookCreditStatusSchema),
  dateFrom: optionalString,
  dateTo: optionalString,
  query: z.string().max(200).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  sortBy: bigBookLedgerSortKeySchema.optional().default("entry_date"),
  sortDir: bigBookLedgerSortDirSchema.optional().default("desc")
});

export const bigBookCreditsPickerQuerySchema = z.object({
  query: z.string().max(200).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export type BigBookEntriesQuery = z.infer<typeof bigBookEntriesQuerySchema>;

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

export const bigBookExchangeRateQuerySchema = z.object({
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  base_currency: bigBookCurrencySchema,
  quote_currency: bigBookCurrencySchema
});
