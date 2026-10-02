ALTER TABLE users ADD COLUMN ai_consent_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN ai_consent_at INTEGER;
ALTER TABLE identities ADD COLUMN revocation_token TEXT;
