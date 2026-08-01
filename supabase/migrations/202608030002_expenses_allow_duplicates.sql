-- Web Spending records may legitimately repeat (same day, category, amount and
-- description), so the ledger no longer rejects or skips identical rows.
-- Manual entry and CSV import both insert every row as submitted.

drop index if exists uq_expenses_dedupe;
