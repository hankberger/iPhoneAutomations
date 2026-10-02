-- Product analytics events. Keep this intentionally small and first-party: no prompt
-- contents or uploaded media are stored, only the action and the feature involved.
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY,
  event_name TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  slug TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS analytics_events_time ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_time ON analytics_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_user_time ON analytics_events(user_id, created_at DESC);
