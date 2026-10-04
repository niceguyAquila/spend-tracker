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
export const bigBookCreditFlagSchema = z.enum(["credit", "future_credit", "settlement", "none"]);

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
  is_future_credit: z.boolean().optional().default(false),
  is_debt: z.boolean().optional().default(false),
  settles_entry_id: optionalUuidOrEmpty("Settlement target must be a valid id"),
  settlement_conversion_rate: z.coerce.number().positive().nullable().optional(),
  settlement_note: optionalNoteSchema,
  close_credit: z.boolean().optional().default(false),
  credit_settlement_note: optionalNoteSchema,
  close_debt: z.boolean().optional().default(false),
  debt_settlement_note: optionalNoteSchema
});

const optionalGasFeeAmountSchema = z.preprocess((value) => {
  if (value === "" || value == null) return undefined;
  return value;
}, z.coerce.number().positive("Gas fee must be greater than 0").optional());

const optionalKursRateSchema = z.preprocess((value) => {
  if (value === "" || value == null) return undefined;
  return value;
}, z.coerce.number().finite("KURS rate must be a number").optional());

const optionalKursAmountSchema = z.preprocess((value) => {
  if (value === "" || value == null) return undefined;
  return value;
}, z.coerce.number().positive("KURS amount must be greater than 0").optional());

function refineBigBookEntryCreditFields<
  T extends {
    is_credit?: boolean;
    is_future_credit?: boolean;
    is_debt?: boolean;
    entry_direction?: string;
    settles_entry_id?: string | null;
    settlement_conversion_rate?: number | null;
    close_credit?: boolean;
    close_debt?: boolean;
    currency_code?: string;
  }
>(value: T, ctx: z.RefinementCtx) {
  if (value.is_future_credit && !value.is_credit) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Future credit requires the credit settlement type.",
      path: ["is_future_credit"]
    });
  }
  if (value.is_credit && value.is_debt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "An entry cannot be marked as both credit and debt.",
      path: ["is_debt"]
    });
  }
  if (value.is_future_credit && value.is_debt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "An entry cannot be marked as both future credit and debt.",
      path: ["is_debt"]
    });
  }
  if (value.is_credit && value.settles_entry_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A settlement entry cannot also be marked as credit.",
      path: ["is_credit"]
    });
  }
  if (value.is_future_credit && value.settles_entry_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A settlement entry cannot also be marked as future credit.",
      path: ["is_future_credit"]
    });
  }
  if (value.is_debt && value.settles_entry_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A settlement entry cannot also be marked as debt.",
      path: ["is_debt"]
    });
  }
  if (value.is_debt && value.entry_direction && value.entry_direction !== "spending") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Debt entries must use Cash Flow Out (spending).",
      path: ["entry_direction"]
    });
  }
  // Conversion rate / settlement_amount_in_credit_currency are optional on input.
  // Same-currency settles derive rate = 1 + credit-currency amount in the API;
  // cross-currency FX fields stay null unless a positive rate is provided.
  if (value.close_credit && !value.settles_entry_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Closing a credit requires a settlement target.",
      path: ["close_credit"]
    });
  }
  if (value.close_debt && !value.settles_entry_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Closing a debt requires a settlement target.",
      path: ["close_debt"]
    });
  }
  if (value.close_credit && value.close_debt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Cannot close both credit and debt on the same settlement.",
      path: ["close_debt"]
    });
  }
}

function isUsdtInflow(value: { currency_code: string; entry_direction: string }) {
  return value.currency_code === "USDT" && value.entry_direction === "profit";
}

function refineKursFields<
  T extends {
    currency_code: string;
    entry_direction: string;
    kurs_rate?: number;
    kurs_amount?: number;
  }
>(value: T, ctx: z.RefinementCtx) {
  const hasKurs = value.kurs_rate != null || value.kurs_amount != null;
  if (!hasKurs) return;
  if (!isUsdtInflow(value)) {
    const path = value.kurs_amount != null ? ["kurs_amount"] : ["kurs_rate"];
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "KURS is only allowed for USDT inflow (In) entries.",
      path
    });
  }
}

export const bigBookEntryInputSchema = bigBookEntryBaseSchema
  .extend({
    gas_fee_amount: optionalGasFeeAmountSchema,
    kurs_rate: optionalKursRateSchema,
    kurs_amount: optionalKursAmountSchema
  })
  .superRefine((value, ctx) => {
    refineBigBookEntryCreditFields(value, ctx);
    if (value.gas_fee_amount != null && value.currency_code !== "USDT") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Gas fee is only allowed for USDT entries.",
        path: ["gas_fee_amount"]
      });
    }
    refineKursFields(value, ctx);
  });

const expectedUpdatedAtSchema = z
  .string()
  .trim()
  .min(1, "expected_updated_at is required")
  .refine((value) => Number.isFinite(Date.parse(value)), {
    message: "expected_updated_at must be a valid ISO timestamp."
  });

export const bigBookEntryUpdateSchema = bigBookEntryBaseSchema
  .extend({
    id: z.string().uuid(),
    expected_updated_at: expectedUpdatedAtSchema
  })
  .superRefine(refineBigBookEntryCreditFields);

export const bigBookCreditSettleSchema = z.object({
  id: z.string().uuid(),
  expected_updated_at: expectedUpdatedAtSchema,
  settled: z.boolean(),
  note: optionalNoteSchema
});

/** Toggle Future Credit ↔ actualized Credit without rewriting the full entry. */
export const bigBookCreditActualizeSchema = z.object({
  id: z.string().uuid(),
  expected_updated_at: expectedUpdatedAtSchema,
  actualized: z.boolean()
});

export const bigBookTypeVendorTypeMapCreateSchema = z.object({
  entry_type_id: z.string().uuid("Select a type."),
  vendor_type_id: z.string().uuid("Select a vendor type.")
});

export const bigBookTypeVendorTypeMapUpdateSchema = z.object({
  id: z.string().uuid(),
  entry_type_id: z.string().uuid("Select a type.").optional(),
  vendor_type_id: z.string().uuid("Select a vendor type.").optional()
});

export const bigBookTypeVendorTypeMapDeleteSchema = z.object({
  id: z.string().uuid()
});

export const bigBookBulkSettleModeSchema = z.enum(["single", "per_credit"]);

const optionalProfitAmountSchema = z.preprocess((value) => {
  if (value === "" || value == null) return undefined;
  return value;
}, z.coerce.number().positive("PROFIT amount must be greater than 0").optional());

export const bigBookBulkSettleSchema = z
  .object({
    credit_entry_ids: z
      .array(z.string().uuid())
      .min(1, "Select at least one open credit to settle.")
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length, "Duplicate credit ids"),
    mode: bigBookBulkSettleModeSchema.default("single"),
    entry_date: z.string().min(1, "Date is required"),
    close_credits: z.boolean().optional().default(true),
    settlement_note: optionalNoteSchema,
    explanation: z.string().trim().min(2).max(500).optional(),
    /** Override settlement payment currency (defaults to each credit's currency). */
    currency_code: bigBookCurrencySchema.optional(),
    /**
     * Settlement amount in `currency_code`.
     * - single mode: one combined payment amount (defaults to sum of credit amounts when same currency / rate 1)
     * - per_credit mode: ignored; each settlement uses that credit's converted amount
     */
    amount: z.coerce.number().positive("Amount must be greater than 0").optional(),
    /**
     * credit_currency units per 1 settlement_currency unit.
     * Required when settlement currency differs from credit currency; forced to 1 when same.
     */
    settlement_conversion_rate: z.coerce.number().positive().optional(),
    /**
     * Optional PROFIT surcharge in the credit currency (creates a separate PROFIT-type ledger row).
     */
    profit_amount: optionalProfitAmountSchema,
    /** Optional KURS rate for USDT settle path (companion USDT spending). */
    kurs_rate: optionalKursRateSchema,
    /** Optional KURS amount override (companion USDT spending). */
    kurs_amount: optionalKursAmountSchema
  })
  .superRefine((value, ctx) => {
    const hasKurs = value.kurs_rate != null || value.kurs_amount != null;
    if (!hasKurs) return;
    if (value.currency_code !== "USDT") {
      const path = value.kurs_amount != null ? ["kurs_amount"] : ["kurs_rate"];
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "KURS is only allowed when settlement currency is USDT.",
        path
      });
    }
  });

export const bigBookBulkDebtSettleModeSchema = z.enum(["single", "per_debt"]);

export const bigBookBulkDebtSettleSchema = z.object({
  debt_entry_ids: z
    .array(z.string().uuid())
    .min(1, "Select at least one open debt to pay.")
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Duplicate debt ids"),
  mode: bigBookBulkDebtSettleModeSchema.default("single"),
  entry_date: z.string().min(1, "Date is required"),
  close_debts: z.boolean().optional().default(true),
  settlement_note: optionalNoteSchema,
  explanation: z.string().trim().min(2).max(500).optional(),
  currency_code: bigBookCurrencySchema.optional(),
  amount: z.coerce.number().positive("Amount must be greater than 0").optional(),
  settlement_conversion_rate: z.coerce.number().positive().optional()
});

const bigBookGroupEntryFieldsSchema = bigBookEntryBaseSchema.omit({
  settles_entry_id: true,
  settlement_conversion_rate: true,
  settlement_note: true,
  close_credit: true,
  credit_settlement_note: true,
  close_debt: true,
  debt_settlement_note: true
});
const bigBookGroupEntryInputSchema = bigBookGroupEntryFieldsSchema.superRefine((value, ctx) => {
  refineBigBookEntryCreditFields(value, ctx);
});
// Group create expands companions client-side (gas fee / KURS) into plain entry rows,
// so group entry schema stays without kurs_rate / gas_fee_amount fields.
// Settlement Type (is_credit / is_debt) is allowed so grouped Debt/Credit marks persist.

export const bigBookGroupCreateSchema = z.object({
  label: z.string().trim().min(2).max(200),
  remark: z.string().max(1000).optional().or(z.literal("")),
  entries: z.array(bigBookGroupEntryInputSchema).min(2).max(50)
});

export const bigBookGroupEntryUpdateSchema = bigBookGroupEntryFieldsSchema
  .extend({
    id: z.string().uuid().optional()
  })
  .superRefine((value, ctx) => {
    refineBigBookEntryCreditFields(value, ctx);
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
  entryId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform((value) => (value && value.length ? value : undefined)),
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  sortBy: bigBookLedgerSortKeySchema.optional().default("entry_date"),
  sortDir: bigBookLedgerSortDirSchema.optional().default("desc")
});

export const bigBookCreditsPickerQuerySchema = z.object({
  query: z.string().max(200).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const bigBookVendorActorOutstandingEntriesQuerySchema = z.object({
  actorId: z.string().uuid(),
  currency: bigBookCurrencySchema,
  vendorId: z.union([z.string().uuid(), z.literal("none")]).default("none"),
  dateFrom: optionalString,
  dateTo: optionalString,
  /** `future` = Future Credit only; default `credit` = actualized Credit only. */
  creditKind: z.enum(["credit", "future"]).optional().default("credit")
});

/** Outstanding debt detail rows are keyed by group (or standalone entry id). */
export const bigBookVendorActorOutstandingDebtEntriesQuerySchema = z
  .object({
    actorId: z.string().uuid(),
    currency: bigBookCurrencySchema,
    groupId: z.union([z.string().uuid(), z.literal("none")]).default("none"),
    entryId: z.string().uuid().optional(),
    dateFrom: optionalString,
    dateTo: optionalString
  })
  .superRefine((value, ctx) => {
    if (value.groupId === "none" && !value.entryId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "entryId is required when groupId is none.",
        path: ["entryId"]
      });
    }
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
