import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryD1 } from './d1.js';
import app from '../src/worker.js';

// Same table as the live Waitlist database.
const WAITLIST_SCHEMA = `CREATE TABLE waitlist_signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE CHECK(length(email) BETWEEN 3 AND 254),
  project TEXT NOT NULL CHECK(length(project) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(project, email)
)`;

function boot(env = {}) {
  const waitlist = memoryD1({ schema: WAITLIST_SCHEMA });
  env = { DB: memoryD1(), WAITLIST_DB: waitlist, APP_URL: 'http://localhost', ...env };
  let cookie = '';
  const req = async (path, opts = {}) => {
    const res = await app.fetch(new Request(`http://localhost${path}`, { redirect: 'manual', ...opts, headers: { cookie, 'cf-connecting-ip': String(Math.random()), ...opts.headers } }), env);
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return res;
  };
  const join = (data) => req('/waitlist', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data).toString() });
  const rows = () => waitlist.raw.prepare('SELECT email, project FROM waitlist_signups').all();
  return { req, join, rows };
}

test('banner shows on site pages but not in-app pages', async () => {
  const { req } = boot();
  for (const path of ['/', '/automations', '/terms', '/login']) assert.match(await (await req(path)).text(), /Mobile app coming soon/, path);
  assert.doesNotMatch(await (await req('/app/privacy')).text(), /Mobile app coming soon/);
});

test('joining stores the email for this project and hides the banner', async () => {
  const { req, join, rows } = boot();
  const res = await join({ email: '  Pat@Example.com ' });
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /You’re on the list/);
  assert.doesNotMatch(html, /Mobile app coming soon/);
  assert.deepEqual(rows().map((r) => ({ ...r })), [{ email: 'pat@example.com', project: 'iPhoneAutomation' }]);
  assert.doesNotMatch(await (await req('/')).text(), /Mobile app coming soon/);
});

test('duplicate signups are friendly and stored once', async () => {
  const { join, rows } = boot();
  await join({ email: 'pat@example.com' });
  const res = await join({ email: 'PAT@example.com' });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /already on the waitlist/);
  assert.equal(rows().length, 1);
});

test('invalid emails are rejected', async () => {
  const { join, rows } = boot();
  for (const email of ['', 'nope', 'a@b', 'a b@c.com', `${'x'.repeat(250)}@a.com`]) {
    const res = await join({ email });
    assert.equal(res.status, 400, email);
    assert.match(await res.text(), /Enter a valid email address/);
  }
  assert.equal(rows().length, 0);
});

test('honeypot submissions are not stored', async () => {
  const { join, rows } = boot();
  assert.equal((await join({ email: 'bot@example.com', website: 'spam' })).status, 200);
  assert.equal(rows().length, 0);
});

test('a missing waitlist database fails gracefully', async () => {
  const { join } = boot({ WAITLIST_DB: undefined });
  const res = await join({ email: 'pat@example.com' });
  assert.equal(res.status, 503);
  assert.match(await res.text(), /not available right now/);
});
