ALTER TABLE app_store_transactions ADD COLUMN last_signed_date INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_store_transactions ADD COLUMN state_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_store_transactions ADD COLUMN balance_delta INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app_store_transactions ADD COLUMN removed_micros INTEGER NOT NULL DEFAULT 0;
-- Preserve refunds already processed by the initial transaction verifier.
UPDATE app_store_transactions SET removed_micros = COALESCE(
  (SELECT -amount_micros FROM ledger WHERE apple_event_id = 'refund:' || app_store_transactions.id),
  credit_micros
) WHERE revoked = 1;
