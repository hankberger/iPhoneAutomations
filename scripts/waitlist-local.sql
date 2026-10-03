-- Local copy of the shared Waitlist database's table, for `npm run dev:local` only.
-- The live table is owned outside this repo; never apply this remotely.
CREATE TABLE IF NOT EXISTS waitlist_signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE CHECK(length(email) BETWEEN 3 AND 254),
  project TEXT NOT NULL CHECK(length(project) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(project, email)
);
