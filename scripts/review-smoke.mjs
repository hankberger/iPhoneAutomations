// Local workerd + D1 smoke test. First bundle with:
// npx wrangler deploy --dry-run --outdir /tmp/iphoneautomations-review-worker --env local
// No production configuration, network calls or payment credentials are used.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, script: await readFile('/tmp/iphoneautomations-review-worker/worker.js', 'utf8'),
  compatibilityDate: '2026-09-01', compatibilityFlags: ['nodejs_compat'],
  d1Databases: ['DB'],
  bindings: { APP_URL: 'http://localhost', APP_STORE_ISSUER_ID: 'test', APP_STORE_KEY_ID: 'test', APP_STORE_PRIVATE_KEY: 'unused', APP_STORE_APP_ID: '123' },
}));
try {
  const db = await mf.getD1Database('DB');
  for (const name of (await readdir(new URL('../migrations/', import.meta.url))).sort()) {
    const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
    // D1 exec's API accepts statements one per line for these simple migrations.
    await db.exec(sql.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').replace(/;/g, ';\n'));
  }
  const key = 'aa_live_local_smoke_only';
  const hash = Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))).toString('hex');
  await db.prepare("INSERT INTO users(id,email,password_hash,created_at) VALUES (1,'local@example.invalid','',0)").run();
  await db.prepare("INSERT INTO api_keys(user_id,key_hash,prefix,name,created_at,can_mint) VALUES(1,?,'aa_live','local',0,1)").bind(hash).run();
  const req = (path, body) => mf.dispatchFetch(`http://localhost${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal((await req('/api/v1/store')).status, 200);
  assert.equal((await req('/api/v1/account/privacy')).status, 200);
  assert.equal((await req('/api/v1/run/ask-ai', { input: 'must not send' })).status, 403);
  assert.equal((await req('/api/v1/store/purchase', { signed_transaction: 'forged' })).status, 400);
  assert.equal((await req('/webhooks/apple', { signedPayload: 'forged' })).status, 400);
  assert.equal((await req('/api/v1/account/delete', { confirmation: 'DELETE' })).status, 503, 'deletion rollout remains closed');
  assert.equal((await req('/api/v1/account/privacy', { version: 1, allowed: true })).status, 200);
  assert.equal((await (await req('/api/v1/account/privacy')).json()).allowed, true);
  console.log('PASS: actual local workerd/D1 migrations, account routes, consent, invalid Apple signatures and closed deletion gate');
} finally { await mf.dispose(); }
