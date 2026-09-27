import { AUTOMATIONS, CATEGORIES } from './catalog.js';
import { MODELS, retailPrice } from './inference.js';
import { TOPUP_AMOUNTS, formatUsd } from './billing.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const date = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const cents = (usd) => (usd * 100 < 0.01 ? '<0.01¢' : `${Number((usd * 100).toPrecision(2))}¢`);

const ICONS = {
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  wand: '<path d="M4 20 15 9M14 4v3M19 9h-3M17.5 5.5 16 7"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
};
export const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

export function layout({ title, user, body, active = '' }) {
  const nav = (href, label) => `<a href="${href}"${active === href ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title ? `${title} · Advanced Automations` : 'Advanced Automations: free iPhone automations, powered by AI')}</title>
<meta name="description" content="Free iPhone Shortcuts automations with pay-as-you-go AI. No subscription.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/bricolage.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="site-header">
  <div class="wrap row">
    <a class="brand" href="/"><i class="mark"></i><span>Advanced Automations</span></a>
    <nav class="nav">
      ${nav('/automations', 'Automations')}
      ${nav('/pricing', 'Pricing')}
      ${user ? `<a class="btn btn-sm" href="/account">Account</a>` : `${nav('/login', 'Log in')}<a class="btn btn-sm" href="/signup">Get started</a>`}
    </nav>
  </div>
</header>
<main>${body}</main>
<footer class="site-footer">
  <div class="wrap row">
    <a class="brand small" href="/"><i class="mark"></i><span>Advanced Automations</span></a>
    <span class="muted small">© ${new Date().getFullYear()} · iphoneadvanced.com</span>
  </div>
</footer>
</body>
</html>`;
}

const card = (a) => `
  <a class="card c-${a.color}" href="/automations/${a.slug}">
    <span class="ic">${icon(a.icon)}</span>
    <h3>${e(a.name)}</h3>
    <p>${e(a.tagline)}</p>
    <span class="meta"><span>${e(a.trigger)}</span><span>~${cents(a.typicalCost)}</span></span>
  </a>`;

const tile = (a, extra = '') => `<a class="tile c-${a.color}${extra}" href="/automations/${a.slug}">${icon(a.icon)}<span>${e(a.name)}</span></a>`;

export function landing({ user }) {
  const [sum, reply, tone, voice, remind, receipt, translate, brief] = AUTOMATIONS;
  return layout({
    user,
    body: `
<section class="hero wrap">
  <div>
    <h1>Make your iPhone do the <mark>boring bits.</mark></h1>
    <p class="lede">Free, ready-made Shortcuts with a little AI inside. Top up a few dollars and most runs cost well under a cent.</p>
    <div class="cta">
      <a class="btn btn-lg" href="${user ? '/account' : '/signup'}">${user ? 'Go to your account' : 'Get started, it’s free'}</a>
      <a class="link" href="/automations">Browse automations →</a>
    </div>
  </div>
  <div class="tiles" aria-label="Featured automations">
    ${tile(sum)}${tile(reply, ' tilt-r')}${tile(voice)}
    ${tile(remind, ' tilt-l')}${tile(receipt)}${tile(translate)}
    <div class="tile tile-result"><div><b>Summarize Anything</b>Launch moves to Oct 14. Design review Thursday. Budget unchanged.</div><small>Llama 3.3 70B · $0.0006</small></div>
    ${tile(brief, ' tilt-r')}
  </div>
</section>

<section class="wrap section center">
  <h2>Pick one. Build it in two minutes.</h2>
  <p class="muted">Every automation lists the exact Shortcuts actions to add.</p>
  <div class="grid">${[sum, reply, voice, remind, receipt, translate, brief, tone].map(card).join('')}</div>
</section>

<section class="wrap how">
  <div><b>1</b><h3>Pick an automation</h3><p>Browse the library and open the steps.</p></div>
  <div><b>2</b><h3>Paste your key</h3><p>One API key from your account, pasted once.</p></div>
  <div><b>3</b><h3>Run it anywhere</h3><p>Share Sheet, Back Tap, Action Button or Siri.</p></div>
</section>

<section class="wrap stats">
  <div><b>$0</b><p>for every automation, forever</p></div>
  <div><b>&lt;1¢</b><p>typical cost of one run</p></div>
  <div><b>$5</b><p>minimum top-up, credit never expires</p></div>
</section>`,
  });
}

export function catalog({ user, category }) {
  const list = category ? AUTOMATIONS.filter((a) => a.category === category) : AUTOMATIONS;
  const chip = (c, label) => `<a class="chip" href="/automations${c ? `?category=${encodeURIComponent(c)}` : ''}"${(category || '') === c ? ' aria-current="true"' : ''}>${label}</a>`;
  return layout({
    title: 'Automations',
    user,
    active: '/automations',
    body: `
<section class="wrap page-head center">
  <h1>Automations</h1>
  <p class="lede">All free. Each one runs in the Shortcuts app and calls our API with your key.</p>
  <div class="chips">${chip('', 'All')}${CATEGORIES.map((c) => chip(c, c)).join('')}</div>
</section>
<section class="wrap"><div class="grid">${list.map(card).join('')}</div></section>`,
  });
}

export function automationDetail({ user, a, apiUrl }) {
  const steps = a.steps.map((s, i) => `
    <li><span class="step-n">${i + 1}</span><div><strong>${e(s.action)}</strong>${s.detail ? `<p>${e(s.detail.replace('{{API_URL}}', apiUrl))}</p>` : ''}</div></li>`).join('');
  const body = JSON.stringify({ prompt: a.prompt, input: '<Shortcut Input>', model: a.model }, null, 2);
  return layout({
    title: a.name,
    user,
    active: '/automations',
    body: `
<section class="wrap detail">
  <a class="link small" href="/automations">← All automations</a>
  <div class="detail-head c-${a.color}">
    <span class="big-ic">${icon(a.icon)}</span>
    <div>
      <h1>${e(a.name)}</h1>
      <p class="lede">${e(a.tagline)}</p>
      <dl class="facts">
        <div><dt>Runs from</dt><dd>${e(a.trigger)}</dd></div>
        <div><dt>Model</dt><dd>${e(MODELS[a.model].label)}</dd></div>
        <div><dt>Typical cost</dt><dd>~${cents(a.typicalCost)} per run</dd></div>
      </dl>
    </div>
  </div>
  <div class="detail-grid">
    <div>
      <h2>Build it in Shortcuts</h2>
      <ol class="steps-list">${steps}</ol>
    </div>
    <aside class="panel dark">
      <h3>Request body</h3>
      <pre><code>${e(body)}</code></pre>
      <p class="small">Method POST, Request Body JSON, and the header <code>Authorization: Bearer YOUR_KEY</code>.</p>
      ${user ? '<a class="btn btn-light btn-block" href="/account#keys">Get your API key</a>' : '<a class="btn btn-light btn-block" href="/signup">Create an account to get a key</a>'}
    </aside>
  </div>
</section>`,
  });
}

export function pricing({ user }) {
  const rows = Object.entries(MODELS).map(([id, m]) => {
    const p = retailPrice(id);
    return `<tr><td><strong>${e(m.label)}</strong><div class="small muted">${id}</div></td><td class="num">$${p.input.toFixed(2)}</td><td class="num">$${p.output.toFixed(2)}</td></tr>`;
  }).join('');
  return layout({
    title: 'Pricing',
    user,
    active: '/pricing',
    body: `
<section class="wrap page-head center">
  <h1>Simple pricing</h1>
  <p class="lede">Automations are free. AI usage comes out of a balance you top up. No subscription, and credit never expires.</p>
</section>
<section class="wrap narrow">
  <div class="stats">
    <div><b>$0</b><p>for every automation</p></div>
    <div><b>&lt;1¢</b><p>typical run</p></div>
    <div><b>$5</b><p>smallest top-up</p></div>
  </div>
  <div class="panel">
    <h2>Per-token rates</h2>
    <table class="table">
      <thead><tr><th>Model</th><th class="num">Input / 1M tokens</th><th class="num">Output / 1M tokens</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="small muted">A typical run uses a few hundred tokens. Top-ups: ${TOPUP_AMOUNTS.map((d) => `$${d}`).join(', ')}.</p>
  </div>
</section>`,
  });
}

// Brand marks for the sign-in buttons (Google's four-colour G, Apple's logo).
const PROVIDER_LOGOS = {
  google: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>',
  apple: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/></svg>',
};

export function authPage({ mode, error, email = '', next = '', providers = [] }) {
  const isLogin = mode === 'login';
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : '';
  const social = providers.length ? `
    <div class="oauth">${providers.map((p) => `
      <a class="btn btn-lg btn-block oauth-${p.id}" href="/auth/${p.id}${e(nextQuery)}">${PROVIDER_LOGOS[p.id] || ''}<span>Continue with ${e(p.name)}</span></a>`).join('')}
    </div>
    <p class="divider small muted"><span>or use email</span></p>` : '';
  return layout({
    title: isLogin ? 'Log in' : 'Create account',
    active: isLogin ? '/login' : '',
    body: `
<section class="wrap auth">
  <div class="auth-tiles" aria-hidden="true">${AUTOMATIONS.slice(0, 4).map((a) => `<span class="mini c-${a.color}">${icon(a.icon)}</span>`).join('')}</div>
  <form class="auth-card" method="post" action="/${mode}">
    <h1>${isLogin ? 'Welcome back' : 'Create your account'}</h1>
    <p class="muted">${isLogin ? 'Log in to manage your balance and keys.' : 'Free forever. Add credit only when you want AI.'}</p>
    ${error ? `<p class="alert" role="alert">${e(error)}</p>` : ''}${social}
    <input type="hidden" name="next" value="${e(next)}">
    <label>Email<input name="email" type="email" autocomplete="email" required value="${e(email)}"></label>
    <label>Password<input name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" minlength="10" required></label>
    <button class="btn btn-lg btn-block" type="submit">${isLogin ? 'Log in' : 'Create account'}</button>
    <p class="small muted center">${isLogin ? 'New here? <a href="/signup">Create an account</a>' : 'Have an account? <a href="/login">Log in</a>'}</p>
  </form>
</section>`,
  });
}

export function account({ user, keys, history, linked = [], newKey, notice, billingEnabled, inferenceEnabled, apiUrl }) {
  const topups = TOPUP_AMOUNTS.map((d) => `
    <form method="post" action="/account/topup">
      <input type="hidden" name="csrf" value="${e(user.csrf)}">
      <input type="hidden" name="amount" value="${d}">
      <button class="amount" type="submit"${billingEnabled ? '' : ' disabled'}>$${d}</button>
    </form>`).join('');
  const keyRows = keys.length ? keys.map((k) => `
    <li class="key-row">
      <span class="mini c-violet">${icon('key')}</span>
      <div class="grow"><strong>${e(k.name)}</strong><div class="small muted">${e(k.prefix)}… · created ${date(k.created_at)}${k.last_used_at ? ` · last used ${date(k.last_used_at)}` : ''}</div></div>
      <form method="post" action="/account/keys/${k.id}/revoke"><input type="hidden" name="csrf" value="${e(user.csrf)}"><button class="btn btn-soft btn-sm" type="submit">Revoke</button></form>
    </li>`).join('') : '<li class="muted small empty">No keys yet. Create one for each device.</li>';
  const historyRows = history.length ? history.map((h) => `
    <tr><td>${date(h.created_at)}</td><td>${e(h.description)}</td><td class="num ${h.amount_micros > 0 ? 'pos' : ''}">${h.amount_micros > 0 ? '+' : '−'}${formatUsd(Math.abs(h.amount_micros), Math.abs(h.amount_micros) < 10_000 ? 4 : 2)}</td></tr>`).join('')
    : '<tr><td colspan="3" class="muted small">Nothing yet. Top up to get started.</td></tr>';

  return layout({
    title: 'Account',
    user,
    active: '/account',
    body: `
<section class="wrap page-head">
  <div class="row between">
    <div><h1>Hi there</h1><p class="muted">${e(user.email)}${linked.length ? ` · signs in with ${linked.map((p) => (p === 'apple' ? 'Apple' : 'Google')).join(' and ')}` : ''}</p></div>
    <form method="post" action="/logout"><input type="hidden" name="csrf" value="${e(user.csrf)}"><button class="btn btn-soft btn-sm" type="submit">Log out</button></form>
  </div>
  ${notice ? `<p class="notice ${notice.tone}">${e(notice.text)}</p>` : ''}
</section>
<section class="wrap account-grid">
  <div class="panel balance">
    <span class="label">Balance</span>
    <div class="big">${formatUsd(user.balance_micros)}</div>
    <span class="label">Add credit</span>
    <div class="amounts">${topups}</div>
    <p class="small">${billingEnabled ? 'Secure checkout by Stripe. Credit never expires.' : 'Payments are not configured on this server yet.'}</p>
  </div>

  <div class="panel" id="keys">
    <h2>API keys</h2>
    <p class="small muted">Paste a key into your shortcut’s Authorization header. Keys spend from your balance.</p>
    ${newKey ? `<div class="newkey"><span class="small">Copy this key now. You won’t see it again.</span><code>${e(newKey)}</code></div>` : ''}
    <ul class="keys">${keyRows}</ul>
    <form class="inline-form" method="post" action="/account/keys">
      <input type="hidden" name="csrf" value="${e(user.csrf)}">
      <input name="name" placeholder="Key name, e.g. My iPhone" maxlength="60" required>
      <button class="btn btn-sm" type="submit">Create key</button>
    </form>
    <p class="small muted">Endpoint <code>${e(apiUrl)}</code>, or <code>${e(apiUrl.replace('/generate', '/ai/run/{model}'))}</code> for the raw Cloudflare format${inferenceEnabled ? '' : ' (inference not configured on this server yet)'}</p>
  </div>

  <div class="panel wide">
    <h2>Activity</h2>
    <table class="table"><thead><tr><th>Date</th><th>Description</th><th class="num">Amount</th></tr></thead><tbody>${historyRows}</tbody></table>
  </div>
</section>`,
  });
}

export const notFound = ({ user }) => layout({
  title: 'Not found', user,
  body: '<section class="wrap page-head center"><h1>Nothing here</h1><p class="lede">That page does not exist. <a href="/automations">Browse automations</a>.</p></section>',
});
