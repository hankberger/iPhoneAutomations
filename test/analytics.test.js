import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryD1 } from './d1.js';
import { dashboardData, DAY } from '../src/analytics.js';
import { createAuth } from '../src/auth.js';
import { admin } from '../src/admin-view.js';
import app from '../src/worker.js';

const END = Date.UTC(2026, 9, 2);
function fixture() {
  const db = memoryD1();
  db.raw.prepare('UPDATE analytics_state SET value = ?').run(END - 200 * DAY);
  const user = (id, age) => db.raw.prepare("INSERT INTO users (id,email,password_hash,created_at) VALUES (?,?,'',?)").run(id, `user${id}@example.test`, END - age * DAY);
  const event = (id, age, status = 200, slug = 'ask-ai', duration = 100) => db.raw.prepare(`INSERT INTO analytics_events
    (user_id,event_name,slug,status,duration_ms,source,created_at) VALUES (?,?,?,?,?,'shortcut-key',?)`)
    .run(id, status === 200 ? 'run_succeeded' : 'run_failed', slug, status, duration, END - age * DAY);
  const purchase = (id, age, amount, stripe = null, apple = null) => db.raw.prepare(`INSERT INTO ledger
    (user_id,kind,amount_micros,description,stripe_session_id,apple_event_id,created_at) VALUES (?,'topup',?,'test',?,?,?)`)
    .run(id, amount, stripe, apple, END - age * DAY);
  return { db, user, event, purchase };
}

test('engagement counts successful people and distinct days, boundaries, zero days and complete comparisons', async () => {
  const { db, user, event } = fixture();
  user(1, 100); user(2, 100); user(3, 100);
  event(1, 9); event(1, 8); // previous week
  event(1, 3); event(1, 3); event(1, 1); // repeat user, not three active days
  event(2, 8); event(2, 1, 402); // lapsed, despite attempted usage
  event(3, 1, 422); // never active
  event(1, 0); // today excluded
  event(1, 30); // inclusive start
  event(1, 31); // previous reporting period
  const d = await dashboardData(db, 30, { now: END + 1000 });
  assert.equal(d.current.runs, 7);
  assert.equal(d.current.active, 2);
  assert.equal(d.current.repeat_users, 1);
  assert.equal(d.current.attempts, 9);
  assert.equal(d.previous.runs, 1);
  assert.equal(d.weekly.repeat_users, 1);
  assert.equal(d.weekly.active, 1);
  assert.equal(d.weekly.previous_active, 2);
  assert.equal(d.weekly.retained, 1);
  assert.equal(d.weekly.lapsed, 1);
  assert.equal(d.today.runs, 1);
  assert.equal(d.daily.length, 30);
  assert.equal(d.daily.filter(d => d.runs === 0 && d.failures === 0).length, 25);
  assert.equal(d.coverage.comparison, true);
});

test('activation and retention use unique accounts, success, maturity and signup-relative boundaries', async () => {
  const { db, user, event } = fixture();
  user(1, 20); event(1, 19); event(1, 12); // day1 activation, day8 retention
  user(2, 20); event(2, 13); // first success exactly day7 is too late
  user(3, 3); event(3, 2); // immature excluded
  user(4, 10); event(4, 9); // activation eligible, retention immature
  user(5, 20); event(5, 19, 402); // failure never activates
  user(6, 40); event(6, 39); event(6, 12); // day28 return
  // Duplicate OAuth signup events cannot inflate the users-based cohort denominator.
  for (let i = 0; i < 3; i++) db.raw.prepare("INSERT INTO analytics_events(user_id,event_name,created_at) VALUES(1,'signup',?)").run(END - 20 * DAY);
  const d = await dashboardData(db, 90, { now: END });
  assert.equal(d.totals.signups, 6);
  assert.equal(d.totals.eligible7, 5);
  assert.equal(d.totals.activated7, 3);
  assert.equal(d.totals.activation_ms, 3 * DAY);
  assert.equal(d.totals.eligible14, 2);
  assert.equal(d.totals.retained14, 1);
  assert.equal(d.totals.eligible35, 1);
  assert.equal(d.totals.retained35, 1);
  db.raw.prepare('UPDATE analytics_state SET value = ?').run(END - 15 * DAY);
  const recent = await dashboardData(db, 90, { now: END });
  assert.equal(recent.coverage.period, false);
  assert.equal(recent.totals.signups, 2, 'unknown pre-instrumentation lifecycles excluded');
  assert.equal(recent.totals.activated7, 1);
});

test('purchased credit excludes free grants and sandbox; paid conversion and returning buyers use history', async () => {
  const { db, user, event, purchase } = fixture();
  user(1, 100); user(2, 100); user(3, 40); user(4, 40);
  event(1, 1); event(2, 1);
  purchase(1, 40, 5000000, 'cs_live_old');
  purchase(1, 2, 5000000, 'cs_live_new');
  purchase(2, 2, 250000); // welcome credit
  purchase(2, 1, 50000000, 'cs_test_ignore');
  db.raw.prepare("INSERT INTO app_store_transactions (id,user_id,product_id,environment,credit_micros,revoked,created_at) VALUES ('Sandbox:123',2,'test','Sandbox',5000000,0,?)").run(END - DAY);
  purchase(2, 1, 5000000, null, 'purchase:Sandbox:123');
  db.raw.prepare("INSERT INTO app_store_transactions (id,user_id,product_id,environment,credit_micros,revoked,created_at) VALUES ('Production:456',3,'test','Production',10000000,0,?)").run(END - 20 * DAY);
  purchase(3, 20, 10000000, null, 'purchase:Production:456');
  purchase(4, 10, 5000000, 'cs_live_day30'); // exactly age 30d excluded from <30d conversion
  const d = await dashboardData(db, 90, { now: END });
  assert.equal(d.money.purchased, 25000000);
  assert.equal(d.money.granted, 250000);
  assert.equal(d.money.active_payers, 1);
  assert.equal(d.totals.paid30, 1);
  const month = await dashboardData(db, 30, { now: END });
  assert.equal(month.money.purchased, 20000000);
  assert.equal(month.money.buyers, 3);
  assert.equal(month.money.first_buyers, 2);
  assert.equal(month.money.previous_purchased, 5000000);
});

test('feature repeat use and p95 measure successes, with failed-only features retained', async () => {
  const { db, user, event } = fixture(); user(1, 100);
  for (let i = 1; i <= 20; i++) event(1, 1, 200, 'ask-ai', i * 100);
  event(1, 2, 402, 'ask-ai', 99999);
  event(1, 3, 422, 'pull-out-details', 1000);
  const d = await dashboardData(db, 30, { now: END });
  assert.equal(d.features[0].p95_ms, 1900);
  assert.equal(d.features[0].repeat_users, 0);
  assert.equal(d.features[0].users, 1);
  assert.equal(d.features[0].credit_blocks, 1);
  assert.equal(d.features[1].p95_ms, null);
});

test('admin and export require verified email or explicitly allowlisted account ID, never a bearer key', async () => {
  const { db, user } = fixture(); user(1, 100);
  const auth = createAuth(db);
  const session = await auth.startSession(1);
  const env = { DB: db, ADMIN_EMAILS: 'user1@example.test' };
  const req = (path, cookie = '') => app.fetch(new Request(`https://example.test${path}`, { headers: { cookie } }), env);
  for (const path of ['/admin', '/admin/export']) {
    assert.equal((await req(path)).status, 302);
    const unverified = await req(path, `aa_session=${session.token}`);
    assert.equal(unverified.status, 404);
    assert.equal(unverified.headers.get('cache-control'), 'private, no-store');
  }
  db.raw.prepare('UPDATE users SET email_verified_at = ? WHERE id=1').run(END);
  const allowed = await req('/admin', `aa_session=${session.token}`);
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('x-robots-tag'), 'noindex, nofollow');
  const html = await allowed.text();
  assert.match(html, /Weekly repeat users/);
  assert.doesNotMatch(html, /style=|<script/);
  assert.match(html, /admin\.css/);
  const exported = await req('/admin/export?days=Infinity', `aa_session=${session.token}`);
  assert.equal((await exported.json()).days, 30);
  db.raw.prepare('UPDATE users SET email_verified_at = NULL WHERE id=1').run();
  env.ADMIN_USER_IDS = '1';
  assert.equal((await req('/admin', `aa_session=${session.token}`)).status, 200);
});

test('telemetry captures one outcome for audio, generic API, malformed bodies, validation and credit errors', async () => {
  const { db, user } = fixture(); user(1, 1);
  // Also runs against the isolated analytics release, before the parallel consent migration.
  if (db.raw.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'ai_consent_version')) {
    db.raw.exec('UPDATE users SET ai_consent_version = 1');
  }
  const key = await createAuth(db).createApiKey(1, 'test', { canMint: true });
  db.raw.exec('UPDATE users SET balance_micros = 1000000');
  const env = { DB: db, AI: { run: async model => model.includes('whisper')
    ? { text: 'hello', transcription_info: { duration: 60 } }
    : { response: 'hello', usage: { prompt_tokens: 50, completion_tokens: 20 } } } };
  const req = (path, body) => app.fetch(new Request(`https://example.test${path}`, { method: 'POST', headers: { authorization: `Bearer ${key}` }, body }), env);
  assert.equal((await req('/api/v1/run/meeting-notes', 'fake audio')).status, 200);
  assert.equal((await req('/api/v1/generate', JSON.stringify({ prompt: 'private prompt' }))).status, 200);
  assert.equal((await req('/api/v1/ai/run/@cf/meta/llama-3.1-8b-instruct-fp8-fast', '{}')).status, 200);
  assert.equal((await req('/api/v1/run/ask-ai', '{broken')).status, 400);
  assert.equal((await req('/api/v1/run/ask-ai', '{}')).status, 400);
  db.raw.exec('UPDATE users SET balance_micros = 0');
  assert.equal((await req('/api/v1/run/ask-ai', '{"input":"hello"}')).status, 402);
  const events = db.raw.prepare('SELECT * FROM analytics_events').all();
  assert.equal(events.length, 6);
  assert.deepEqual(events.map(e => e.status), [200, 200, 200, 400, 400, 402]);
  assert.equal(events[0].slug, 'meeting-notes');
  assert.ok(events.every(e => e.source === 'iphone-app' && e.duration_ms >= 0 && e.metadata === null));
  assert.doesNotMatch(JSON.stringify(events), /private prompt|fake audio|aa_live_/);
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM ledger WHERE kind='usage'").get().n, 4, 'two audio model charges, one telemetry event');
});

test('empty and partial history render honestly without invalid ratios or hidden seeded data', async () => {
  const db = memoryD1();
  const d = await dashboardData(db, 7);
  const html = admin({ user: { is_admin: true }, data: d });
  assert.match(html, /New measurement window/);
  assert.match(html, /No eligible signup cohorts/);
  assert.doesNotMatch(html, /NaN|Infinity|style=/);
  assert.equal(d.coverage.comparison, false);
  assert.equal(d.daily.length, 7);
});
