import { describe, expect, it } from "vitest";
import { parseWebTransactionsCsv } from "@/lib/web-transactions/csv";

describe("parseWebTransactionsCsv", () => {
  it("parses payment gateway rows and skips duplicate transaction numbers", () => {
    const csv = [
      "Create Time;Last Update Time;Client Order No;Aggregator Order No;Status;Payment Type;Product Type;Currency Code;Original Amount;Amount;Crypto Currency Code;Crypto Amount;Merchant Name;Merchant Rate;Merchant Fee",
      "23/04/2026 14:13:28 +07:00;23/04/2026 14:14:00 +07:00;A001;X1;Successful;Payin;QR;IDR;60000;60000;-;-;m01;1.60%;-960",
      "23/04/2026 15:13:28 +07:00;23/04/2026 15:14:00 +07:00;A001;X2;Successful;Payin;QR;IDR;70000;70000;-;-;m01;1.60%;-1120"
    ].join("\n");

    const result = parseWebTransactionsCsv(csv, "payment_gateway");
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].external_txn_no).toBe("A001");
    expect(result.rows[0].create_time).toBe("2026-04-23T14:13:28+07:00");
    expect(result.rows[0].merchant_rate).toBe(1.6);
    expect(result.rows[0].merchant_fee).toBe(-960);
    expect(result.rows[0].canonical_type).toBe("Payin");
    expect(result.rows[0].canonical_status).toBe("Successful");
  });

  it("returns errors for missing headers or invalid rows", () => {
    const csv = [
      "Create Time;Client Order No;Amount",
      "invalid;A001;not-a-number"
    ].join("\n");
    const result = parseWebTransactionsCsv(csv, "payment_gateway");
    expect(result.rows).toHaveLength(0);
    expect(result.errors.some((item) => item.includes("Missing required header"))).toBe(true);
  });

  it("parses backoffice rows and maps status/type", () => {
    const csv = [
      'ID,"Transaction No","Type","Currency","Amount","Status","Created Date"',
      '"1","TXN-001","Deposit","IDN","60,000.00","Approved","2026-04-23 14:13:28"',
      '"2","TXN-002","Withdraw","IDN","12,500.50","Rejected","2026-04-23 14:14:28"'
    ].join("\n");

    const result = parseWebTransactionsCsv(csv, "backoffice");
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].external_txn_no).toBe("TXN-001");
    expect(result.rows[0].canonical_type).toBe("Payin");
    expect(result.rows[0].canonical_status).toBe("Successful");
    expect(result.rows[1].canonical_type).toBe("Payout");
    expect(result.rows[1].canonical_status).toBe("Failed");
    expect(result.rows[0].create_time).toBe("2026-04-23T14:13:28+07:00");
  });
});
