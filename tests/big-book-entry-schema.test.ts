import { describe, expect, it } from "vitest";
import {
  bigBookCreditSettleSchema,
  bigBookEntryInputSchema,
  bigBookEntryUpdateSchema,
  bigBookEntriesQuerySchema,
  bigBookVendorActorOutstandingEntriesQuerySchema
} from "@/lib/validation/big-book";

const TYPE_ID = "11111111-1111-1111-1111-111111111111";
const ACTOR_ID = "22222222-2222-2222-2222-222222222222";
const CREDIT_ID = "33333333-3333-3333-3333-333333333333";
const ENTRY_ID = "44444444-4444-4444-4444-444444444444";

// Mirrors what the Big Book panel actually posts, including the `null` notes it
// sends for fields that do not apply to the current entry.
const clientPayload = {
  entry_date: "2026-08-01",
  entry_direction: "spending",
  entry_type_id: TYPE_ID,
  entry_sub_type_id: null,
  vendor_type_id: null,
  vendor_id: null,
  pocket_id: null,
  action_by_id: null,
  explanation: "Office supplies",
  amount: 1000,
  currency_code: "IDR",
  remark: "",
  responsible_actor_id: ACTOR_ID,
  is_credit: false,
  settles_entry_id: null,
  settlement_conversion_rate: null,
  settlement_note: "",
  close_credit: false,
  credit_settlement_note: null
};

describe("big book entry schema", () => {
  it("accepts a plain create payload with null notes", () => {
    const parsed = bigBookEntryInputSchema.safeParse(clientPayload);
    expect(parsed.success).toBe(true);
  });

  it("accepts a credit create payload", () => {
    const parsed = bigBookEntryInputSchema.safeParse({ ...clientPayload, is_credit: true });
    expect(parsed.success).toBe(true);
  });

  it("accepts a settlement that leaves the credit open", () => {
    const parsed = bigBookEntryInputSchema.safeParse({
      ...clientPayload,
      settles_entry_id: CREDIT_ID,
      settlement_conversion_rate: 1,
      settlement_note: "partial payment",
      close_credit: false,
      credit_settlement_note: null
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a settlement that closes the credit", () => {
    const parsed = bigBookEntryInputSchema.safeParse({
      ...clientPayload,
      settles_entry_id: CREDIT_ID,
      settlement_conversion_rate: 1,
      close_credit: true,
      credit_settlement_note: "short payment approved"
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an update payload", () => {
    const parsed = bigBookEntryUpdateSchema.safeParse({ ...clientPayload, id: ENTRY_ID });
    expect(parsed.success).toBe(true);
  });

  it("normalizes empty and null notes to null", () => {
    const parsed = bigBookEntryInputSchema.safeParse(clientPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.settlement_note).toBeNull();
      expect(parsed.data.credit_settlement_note).toBeNull();
    }
  });

  it("still rejects an over-long note", () => {
    const parsed = bigBookEntryInputSchema.safeParse({
      ...clientPayload,
      credit_settlement_note: "x".repeat(1001)
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a USDT create payload with a positive gas fee", () => {
    const parsed = bigBookEntryInputSchema.safeParse({
      ...clientPayload,
      currency_code: "USDT",
      gas_fee_amount: 1.33
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.gas_fee_amount).toBe(1.33);
  });

  it("treats an omitted or empty gas fee as skipped", () => {
    const omitted = bigBookEntryInputSchema.safeParse(clientPayload);
    expect(omitted.success).toBe(true);
    if (omitted.success) expect(omitted.data.gas_fee_amount).toBeUndefined();

    const empty = bigBookEntryInputSchema.safeParse({ ...clientPayload, currency_code: "USDT", gas_fee_amount: "" });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.gas_fee_amount).toBeUndefined();
  });

  it("rejects a non-positive gas fee", () => {
    const parsed = bigBookEntryInputSchema.safeParse({
      ...clientPayload,
      currency_code: "USDT",
      gas_fee_amount: 0
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a gas fee when currency is not USDT", () => {
    const parsed = bigBookEntryInputSchema.safeParse({
      ...clientPayload,
      currency_code: "IDR",
      gas_fee_amount: 1.33
    });
    expect(parsed.success).toBe(false);
  });

  it("strips gas_fee_amount from update payloads", () => {
    const parsed = bigBookEntryUpdateSchema.safeParse({
      ...clientPayload,
      id: ENTRY_ID,
      currency_code: "USDT",
      gas_fee_amount: 1.33
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect("gas_fee_amount" in parsed.data).toBe(false);
  });

  it("accepts a credit settle payload with a null note", () => {
    const parsed = bigBookCreditSettleSchema.safeParse({
      id: CREDIT_ID,
      settled: true,
      note: null
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.note).toBeNull();
  });
});

describe("big book outstanding entries query schema", () => {
  it("defaults missing vendorId to none", () => {
    const parsed = bigBookVendorActorOutstandingEntriesQuerySchema.safeParse({
      actorId: ACTOR_ID,
      currency: "MYR"
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.vendorId).toBe("none");
  });

  it("rejects an invalid vendorId", () => {
    const parsed = bigBookVendorActorOutstandingEntriesQuerySchema.safeParse({
      actorId: ACTOR_ID,
      currency: "MYR",
      vendorId: "not-a-vendor"
    });
    expect(parsed.success).toBe(false);
  });
});

describe("big book entries query schema", () => {
  it("accepts an optional entryId focus", () => {
    const parsed = bigBookEntriesQuerySchema.safeParse({
      entryId: ENTRY_ID
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.entryId).toBe(ENTRY_ID);
  });
});
