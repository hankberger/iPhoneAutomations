ALTER TABLE users ADD COLUMN app_account_token TEXT;
CREATE UNIQUE INDEX users_app_account_token ON users(app_account_token);

-- Keep transaction IDs after account deletion to prevent purchase replay. No email,
-- provider token, prompt or payment card data is retained here.
CREATE TABLE app_store_transactions (
  id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  product_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  credit_micros INTEGER NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
ALTER TABLE ledger ADD COLUMN apple_event_id TEXT;
CREATE UNIQUE INDEX ledger_apple_event ON ledger(apple_event_id);
