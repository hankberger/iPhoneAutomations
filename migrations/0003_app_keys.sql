-- Keys that may create more keys. Only the iPhone app's own key gets this, so a key copied out
-- of a shared shortcut can spend credit but cannot mint keys that outlive its revocation.
ALTER TABLE api_keys ADD COLUMN can_mint INTEGER NOT NULL DEFAULT 0;
