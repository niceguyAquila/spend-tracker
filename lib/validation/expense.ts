import { z } from "zod";
import { entityCodeSchema, entityNameSchema, entitySortOrderSchema } from "@/lib/validation/entity-code";

export const spendingCurrencySchema = z.enum(["IDR", "MYR", "USDT", "TRX"]);
export type SpendingCurrencyCode = z.infer<typeof spendingCurrencySchema>;

export const expenseInputSchema = z.object({
  expense_date: z.string().min(1, "Date is required"),
  entry_direction: z.enum(["spending", "profit"]).default("spending"),
  currency_code: spendingCurrencySchema.default("IDR"),
  category_id: z.string().uuid("Category is required"),
  type_id: z.string().uuid().nullable().optional(),
  staff_id: z.string().uuid().nullable().optional(),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  description: z.string().max(500).optional().or(z.literal("")),
  remarks: z.string().max(120).optional().or(z.literal(""))
});

export const categoryInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[A-Z0-9_]+$/, "Code must use uppercase letters, numbers, and underscores."),
  name: z.string().trim().min(2).max(100)
});

export const expenseTypeCreateSchema = z.object({
  code: entityCodeSchema("Type code"),
  name: entityNameSchema("Type name"),
  sort_order: entitySortOrderSchema()
});

export const expenseTypeUpdateSchema = z.object({
  id: z.string().uuid(),
  code: entityCodeSchema("Type code").optional(),
  name: entityNameSchema("Type name").optional(),
  is_active: z.boolean().optional(),
  sort_order: entitySortOrderSchema()
});

export const expenseStaffCreateSchema = z.object({
  code: entityCodeSchema("Staff code"),
  name: entityNameSchema("Staff name"),
  sort_order: entitySortOrderSchema()
});

export const expenseStaffUpdateSchema = z.object({
  id: z.string().uuid(),
  code: entityCodeSchema("Staff code").optional(),
  name: entityNameSchema("Staff name").optional(),
  is_active: z.boolean().optional(),
  sort_order: entitySortOrderSchema()
});

export type ExpenseInput = z.infer<typeof expenseInputSchema>;
