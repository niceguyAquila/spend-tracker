import { describe, expect, it } from "vitest";
import { buildWebTransactionComparison, buildWebTransactionMetrics } from "@/lib/db/queries";
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
      makeRow({
        external_txn_no: "A001",
        client_order_no: "A001",
        amount: 100_000,
        merchant_fee: -1_600,
        canonical_status: "Successful",
        canonical_type: "Payin"
      }),
      makeRow({
        id: "id2",
        external_txn_no: "A002",
        client_order_no: "A002",
        amount: 50_000,
        merchant_fee: -800,
        canonical_status: "Rejected",
        canonical_type: "Payout"
      })
    ];

    const metrics = buildWebTransactionMetrics(rows);
    expect(metrics.total_count).toBe(2);
    expect(metrics.successful_count).toBe(1);
    expect(metrics.gross_amount).toBe(150_000);
    expect(metrics.fee_amount).toBe(-2_400);
    expect(metrics.net_amount).toBe(147_600);
    expect(metrics.payin_count).toBe(1);
    expect(metrics.payin_amount).toBe(100_000);
    expect(metrics.payout_count).toBe(1);
    expect(metrics.payout_amount).toBe(50_000);
  });
});

describe("buildWebTransactionComparison", () => {
  it("pairs by transaction no + type and classifies matched/missing rows", () => {
    const backofficeRows = [
      makeRow({
        id: "bo-1",
        source_system: "backoffice",
        external_txn_no: "TXN-01",
        canonical_type: "Payin",
        canonical_status: "Successful",
        amount: 100_000
      }),
      makeRow({
        id: "bo-2",
        source_system: "backoffice",
        external_txn_no: "TXN-02",
        canonical_type: "Payout",
        canonical_status: "Pending",
        amount: 50_000
      })
    ];

    const paymentGatewayRows = [
      makeRow({
        id: "pg-1",
        source_system: "payment_gateway",
        external_txn_no: "TXN-01",
        canonical_type: "Payin",
        canonical_status: "Successful",
        amount: 100_000
      }),
      makeRow({
        id: "pg-3",
        source_system: "payment_gateway",
        external_txn_no: "TXN-03",
        canonical_type: "Payin",
        canonical_status: "Failed",
        amount: 25_000
      })
    ];

    const result = buildWebTransactionComparison(backofficeRows, paymentGatewayRows);
    expect(result.metrics.matched_count).toBe(1);
    expect(result.metrics.mismatched_count).toBe(0);
    expect(result.metrics.missing_in_backoffice_count).toBe(1);
    expect(result.metrics.missing_in_gateway_count).toBe(1);
  });

  it("treats amount as exact equality and marks difference as mismatch", () => {
    const backofficeRows = [
      makeRow({
        id: "bo-amount",
        source_system: "backoffice",
        external_txn_no: "TXN-100",
        canonical_type: "Payin",
        canonical_status: "Successful",
        amount: 100_000
      })
    ];

    const paymentGatewayRows = [
      makeRow({
        id: "pg-amount",
        source_system: "payment_gateway",
        external_txn_no: "TXN-100",
        canonical_type: "Payin",
        canonical_status: "Successful",
        amount: 100_001
      })
    ];

    const result = buildWebTransactionComparison(backofficeRows, paymentGatewayRows);
    expect(result.metrics.matched_count).toBe(0);
    expect(result.metrics.mismatched_count).toBe(1);
    expect(result.rows[0]?.amount_matches).toBe(false);
  });

  it("calculates side-by-side source totals with payin and payout breakdown", () => {
    const backofficeRows = [
      makeRow({
        id: "bo-a",
        source_system: "backoffice",
        external_txn_no: "BO-1",
        canonical_type: "Payin",
        amount: 80_000
      }),
      makeRow({
        id: "bo-b",
        source_system: "backoffice",
        external_txn_no: "BO-2",
        canonical_type: "Payout",
        amount: 20_000
      })
    ];

    const paymentGatewayRows = [
      makeRow({
        id: "pg-a",
        source_system: "payment_gateway",
        external_txn_no: "PG-1",
        canonical_type: "Payin",
        amount: 55_000
      }),
      makeRow({
        id: "pg-b",
        source_system: "payment_gateway",
        external_txn_no: "PG-2",
        canonical_type: "Payout",
        amount: 35_000
      })
    ];

    const result = buildWebTransactionComparison(backofficeRows, paymentGatewayRows);

    expect(result.metrics.backoffice.total_count).toBe(2);
    expect(result.metrics.backoffice.total_amount).toBe(100_000);
    expect(result.metrics.backoffice.payin_count).toBe(1);
    expect(result.metrics.backoffice.payin_amount).toBe(80_000);
    expect(result.metrics.backoffice.payout_count).toBe(1);
    expect(result.metrics.backoffice.payout_amount).toBe(20_000);

    expect(result.metrics.payment_gateway.total_count).toBe(2);
    expect(result.metrics.payment_gateway.total_amount).toBe(90_000);
    expect(result.metrics.payment_gateway.payin_count).toBe(1);
    expect(result.metrics.payment_gateway.payin_amount).toBe(55_000);
    expect(result.metrics.payment_gateway.payout_count).toBe(1);
    expect(result.metrics.payment_gateway.payout_amount).toBe(35_000);
  });
});
