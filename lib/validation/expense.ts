import { z } from "zod";

export const expenseInputSchema = z.object({
  expense_date: z.string().min(1, "Date is required"),
  category_id: z.string().uuid("Category is required"),
  subcategory_id: z.string().uuid("Sub-category is required"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  note: z.string().max(500).optional().or(z.literal("")),
  reference: z.string().max(120).optional().or(z.literal(""))
});

export const subcategoryInputSchema = z.object({
  category_id: z.string().uuid(),
  name: z.string().min(2).max(100)
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

export type ExpenseInput = z.infer<typeof expenseInputSchema>;
