import { z } from "zod";
import { bigBookCurrencySchema } from "@/lib/validation/big-book";
import { entityNameSchema, entitySortOrderSchema } from "@/lib/validation/entity-code";

export const bigBookWalletCreateSchema = z.object({
  name: entityNameSchema("Wallet name"),
  network: z
    .string({ required_error: "Network is required." })
    .trim()
    .min(2, "Network must be at least 2 characters.")
    .max(80, "Network must be 80 characters or fewer."),
  address: z
    .string({ required_error: "Address is required." })
    .trim()
    .min(4, "Address must be at least 4 characters.")
    .max(200, "Address must be 200 characters or fewer."),
  sort_order: entitySortOrderSchema()
});

export const bigBookWalletUpdateSchema = z.object({
  id: z.string().uuid(),
  name: entityNameSchema("Wallet name").optional(),
  network: z
    .string()
    .trim()
    .min(2, "Network must be at least 2 characters.")
    .max(80, "Network must be 80 characters or fewer.")
    .optional(),
  address: z
    .string()
    .trim()
    .min(4, "Address must be at least 4 characters.")
    .max(200, "Address must be 200 characters or fewer.")
    .optional(),
  is_active: z.boolean().optional(),
  sort_order: entitySortOrderSchema()
});

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value ?? "");

export const invoiceBackgroundColorSchema = z
  .union([
    z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a #RRGGBB hex value."),
    z.literal(""),
    z.null()
  ])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null || value === "") return null;
    return value;
  });

export const bigBookLedgerTypeInvoiceProfileUpsertSchema = z.object({
  type_id: z.string().uuid(),
  pic_name: optionalText(200),
  pic_passport: optionalText(120),
  pic_address: optionalText(400),
  pic_phone: optionalText(80),
  bill_to_company: optionalText(200),
  background_color: invoiceBackgroundColorSchema
});

export const invoiceLineSchema = z.object({
  unit_name: optionalText(120),
  unit_no: optionalText(60),
  period: optionalText(80),
  description: optionalText(500),
  price: z.coerce.number().finite("Price must be a number."),
  big_book_entry_id: z.string().uuid().nullable().optional()
});

export const invoicePdfRequestSchema = z.object({
  title: z.string().trim().min(2).max(200),
  invoice_no: z.string().trim().min(3).max(40),
  invoice_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Invoice date must be YYYY-MM-DD."),
  due_date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date must be YYYY-MM-DD."),
  terms: optionalText(80),
  currency: bigBookCurrencySchema,
  bill_to_company: z.string().trim().min(1).max(200),
  bill_to_name: optionalText(200),
  bill_to_passport: optionalText(120),
  bill_to_address: optionalText(400),
  bill_to_phone: optionalText(80),
  subject: optionalText(300),
  lines: z.array(invoiceLineSchema).min(1, "Add at least one line item."),
  notes: optionalText(2000),
  fx_note: optionalText(1000),
  wallet_ids: z.array(z.string().uuid()).default([]),
  ledger_type_id: z.string().uuid().nullable().optional(),
  background_color: invoiceBackgroundColorSchema
});

export type InvoicePdfRequest = z.infer<typeof invoicePdfRequestSchema>;
