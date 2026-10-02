-- Never recycle an account ID: delayed Stripe payments and in-flight requests
-- retain the numeric ID after personal account data has been deleted.
-- This registry contains only numbers, has no FK to users, and must survive deletion.
CREATE TABLE account_ids (
  id INTEGER PRIMARY KEY CHECK (id > 0 AND id <= 9007199254740991)
);
INSERT INTO account_ids (id) SELECT id FROM users;

-- Allocation and registration happen in the same INSERT statement. Checking in
-- an AFTER trigger also catches SQLite-assigned IDs from older application code.
-- RAISE(ABORT) cannot be bypassed with INSERT OR IGNORE / REPLACE.
CREATE TRIGGER users_register_id AFTER INSERT ON users
BEGIN
  SELECT RAISE(ABORT, 'Account ID has already been used')
    WHERE EXISTS (SELECT 1 FROM account_ids WHERE id = NEW.id);
  INSERT INTO account_ids (id) VALUES (NEW.id);
END;

CREATE TRIGGER users_immutable_id BEFORE UPDATE OF id ON users
WHEN NEW.id != OLD.id
BEGIN
  SELECT RAISE(ABORT, 'Account ID cannot be changed');
END;

CREATE TRIGGER account_ids_no_delete BEFORE DELETE ON account_ids
BEGIN
  SELECT RAISE(ABORT, 'Account ID history must be retained');
END;

CREATE TRIGGER account_ids_no_update BEFORE UPDATE ON account_ids
BEGIN
  SELECT RAISE(ABORT, 'Account ID history must be retained');
END;
