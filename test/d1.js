import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

// Minimal in-memory stand-in for the D1 binding, backed by node:sqlite, so tests run
// the real SQL (migrations included) without workerd. Covers what src/ uses.
export function memoryD1() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  for (const f of fs.readdirSync(new URL('../migrations', import.meta.url)).sort()) {
    db.exec(fs.readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  }
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args), success: true }),
    run: async () => ({ success: true, meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    runSync: () => ({ success: true, meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
  });
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    // D1 runs a batch as one transaction.
    batch: async (stmts) => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const out = stmts.map((s) => s.runSync());
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
