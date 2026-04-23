import { describe, expect, it } from "vitest";
import { buildWebTransactionMetrics } from "@/lib/db/queries";
import type { WebTransaction } from "@/lib/types";

function makeRow(partial: Partial<WebTransaction>): WebTransaction {
  return {
    id: "id",
    brand_id: "brand",
    source_system: "payment_gateway",
    create_time: "2026-04-23T10:00:00+07:00",
    last_update_time: "2026-04-23T10:00:00+07:00",
    external_txn_no: "A001",
    client_order_no: "A001",
    aggregator_order_no: null,
    raw_status: "Successful",
    canonical_status: "Successful",
    raw_type: "Payin",
    canonical_type: "Payin",
    product_type: "QR",
    currency_code: "IDR",
    original_amount: 100,
    amount: 100,
    crypto_currency_code: null,
    crypto_amount: null,
    merchant_name: "m01",
    merchant_rate: 1.6,
    merchant_fee: -1.6,
    raw_payload: null,
    source_file_name: null,
    imported_at: "2026-04-23T10:00:00+07:00",
    ...partial
  };
}

describe("buildWebTransactionMetrics", () => {
  it("calculates totals, successful count, and net amount", () => {
    const rows = [
      makeRow({ client_order_no: "A001", amount: 100_000, merchant_fee: -1_600, status: "Successful" }),
      makeRow({ id: "id2", client_order_no: "A002", amount: 50_000, merchant_fee: -800, status: "Rejected" })
    ];

    const metrics = buildWebTransactionMetrics(rows);
    expect(metrics.total_count).toBe(2);
    expect(metrics.successful_count).toBe(1);
    expect(metrics.gross_amount).toBe(150_000);
    expect(metrics.fee_amount).toBe(-2_400);
    expect(metrics.net_amount).toBe(147_600);
  });
});
