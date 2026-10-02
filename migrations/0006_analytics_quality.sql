-- One row per authenticated API request, not per billable model call.
ALTER TABLE analytics_events ADD COLUMN status INTEGER;
ALTER TABLE analytics_events ADD COLUMN duration_ms INTEGER;
ALTER TABLE analytics_events ADD COLUMN source TEXT;
CREATE INDEX analytics_events_success_user ON analytics_events(event_name, user_id, created_at);
CREATE INDEX ledger_kind_time ON ledger(kind, created_at);
CREATE INDEX users_created ON users(created_at);
CREATE TABLE analytics_state (key TEXT PRIMARY KEY, value INTEGER NOT NULL);
-- Historical billing cannot reconstruct successful requests (audio may bill twice).
INSERT INTO analytics_state (key, value) VALUES ('tracking_started_at', unixepoch() * 1000);
