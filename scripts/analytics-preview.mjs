// Disposable, loopback-only QA server. This script is never part of the Worker bundle.
// Uses synthetic data in memory; does not read .dev.vars or contact production services.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { memoryD1 } from '../test/d1.js';
import { createAuth } from '../src/auth.js';
import { DAY, dashboardData } from '../src/analytics.js';
import { admin } from '../src/admin-view.js';
import app from '../src/worker.js';

const now = Date.now();
const end = Math.floor(now / DAY) * DAY;
const db = memoryD1();
db.raw.prepare('UPDATE analytics_state SET value = ?').run(end - 200 * DAY);
for (let id = 1; id <= 64; id++) {
  const age = 8 + id;
  db.raw.prepare("INSERT INTO users(id,email,password_hash,email_verified_at,created_at) VALUES(?,?,'',?,?)")
    .run(id, `sample-${id}@example.test`, end - age * DAY, end - age * DAY);
  const slugs = ['ask-ai', 'meeting-notes', 'tone-shifter', 'reply-drafter', 'transcribe-audio'];
  for (let d = age - 1; d >= 1; d--) {
    if ((id + d) % 4 !== 0 || id % 7 === 0) continue;
    const status = (id + d) % 28 === 0 ? 402 : (id + d) % 36 === 0 ? 502 : 200;
    db.raw.prepare(`INSERT INTO analytics_events(event_name,user_id,slug,status,duration_ms,source,created_at)
      VALUES(?,?,?,?,?,?,?)`).run(status === 200 ? 'run_succeeded' : 'run_failed', id, slugs[id % slugs.length], status,
        400 + id * 85, id % 3 ? 'shortcut-key' : 'iphone-app', end - d * DAY + id * 60000);
  }
  if (id % 3 === 0) db.raw.prepare("INSERT INTO ledger(user_id,kind,amount_micros,description,stripe_session_id,created_at) VALUES(?,'topup',5000000,'Synthetic preview',?,?)")
    .run(id, `cs_live_preview_${id}`, end - (age - 4) * DAY);
}
const auth = createAuth(db);
const session = await auth.startSession(1);
const empty = memoryD1();
const types = { '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:8790');
    if (url.pathname === '/') {
      res.writeHead(302, { location: '/admin', 'set-cookie': `aa_session=${session.token}; HttpOnly; SameSite=Lax; Path=/` });
      return res.end();
    }
    if (['/styles.css', '/admin.css', '/favicon.svg', '/fonts/inter.woff2', '/fonts/bricolage.woff2'].includes(url.pathname)) {
      const ext = url.pathname.slice(url.pathname.lastIndexOf('.'));
      res.writeHead(200, { 'content-type': types[ext] });
      return res.end(await readFile(new URL(`../public${url.pathname}`, import.meta.url)));
    }
    if (url.pathname === '/empty') {
      res.writeHead(200, { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'; style-src 'self'; img-src 'self' data:" });
      return res.end(admin({ user: { is_admin: true }, data: await dashboardData(empty, url.searchParams.get('days')) }));
    }
    const out = await app.fetch(new Request(url, { headers: req.headers }), { DB: db, ADMIN_USER_IDS: '1' });
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(await out.text());
  } catch (error) { console.error(error); res.writeHead(500); res.end('Preview failed'); }
});
server.listen(8790, '127.0.0.1', () => console.log('Synthetic analytics QA: http://127.0.0.1:8790 · empty state: /empty'));
