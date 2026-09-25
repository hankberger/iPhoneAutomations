import { AUTOMATIONS, CATEGORIES } from './catalog.js';
import { MODELS, retailPrice } from './inference.js';
import { TOPUP_AMOUNTS, formatUsd } from './billing.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const date = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const logo = `<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor"/><path d="M8 15.5 12 7l4 8.5M9.6 12.5h4.8" stroke="var(--bg)" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

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
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="site-header">
  <div class="wrap row">
    <a class="brand" href="/">${logo}<span>Advanced Automations</span></a>
    <nav class="nav">
      ${nav('/automations', 'Automations')}
      ${nav('/pricing', 'Pricing')}
      ${user ? nav('/account', 'Account') : `${nav('/login', 'Log in')}<a class="btn btn-sm" href="/signup">Get started</a>`}
    </nav>
  </div>
</header>
<main>${body}</main>
<footer class="site-footer">
  <div class="wrap row">
    <span>© ${new Date().getFullYear()} Advanced Automations</span>
    <span class="muted">iphoneadvanced.com</span>
  </div>
</footer>
</body>
</html>`;
}

const card = (a) => `
  <a class="card" href="/automations/${a.slug}">
    <div class="card-top"><span class="chip">${e(a.category)}</span><span class="muted small">≈ $${a.typicalCost.toFixed(3)} / run</span></div>
    <h3>${e(a.name)}</h3>
    <p>${e(a.tagline)}</p>
    <span class="card-foot small muted">${e(a.trigger)}</span>
  </a>`;

const phone = `
  <div class="phone" aria-hidden="true">
    <div class="phone-screen">
      <div class="phone-notch"></div>
      <div class="sc-tile t1"><span>Summarize Anything</span><small>Share Sheet</small></div>
      <div class="sc-tile t2"><span>Reply Drafter</span><small>Back Tap</small></div>
      <div class="sc-tile t3"><span>Voice to Notes</span><small>Action Button</small></div>
      <div class="sc-tile t4"><span>Morning Brief</span><small>7:00 AM</small></div>
      <div class="sc-result">
        <div class="sc-result-head"><span class="dot"></span>Summarize Anything</div>
        <p>Q3 launch moves to Oct 14. Design review Thursday. Budget unchanged.</p>
        <small>Sonnet 5 · $0.004</small>
      </div>
    </div>
  </div>`;

export function landing({ user, heroImage }) {
  const featured = AUTOMATIONS.slice(0, 6).map(card).join('');
  return layout({
    user,
    body: `
<section class="hero wrap">
  <div class="hero-copy">
    <p class="eyebrow">Free Shortcuts · Pay-as-you-go AI</p>
    <h1>Your iPhone, <span class="soft">quietly smarter.</span></h1>
    <p class="lede">Ready-made automations for the Shortcuts app. Every automation is free. You only pay for the AI it uses, a fraction of a cent per run, from a balance you top up when you like.</p>
    <div class="cta">
      <a class="btn" href="${user ? '/account' : '/signup'}">${user ? 'Go to your account' : 'Create a free account'}</a>
      <a class="btn btn-ghost" href="/automations">Browse automations</a>
    </div>
    <p class="small muted">No subscription. Credit never expires.</p>
  </div>
  ${heroImage ? `<img class="hero-img" src="${heroImage}" alt="Advanced Automations running on an iPhone">` : phone}
</section>

<section class="wrap steps">
  <div><span class="step-num">1</span><h3>Pick an automation</h3><p>Each one lists the exact Shortcuts actions to add. Most take two minutes.</p></div>
  <div><span class="step-num">2</span><h3>Add your key</h3><p>Create an API key in your account and paste it into the shortcut once.</p></div>
  <div><span class="step-num">3</span><h3>Run it anywhere</h3><p>Share Sheet, Back Tap, Action Button or Siri. Usage comes out of your balance.</p></div>
</section>

<section class="wrap section">
  <div class="section-head"><h2>Popular automations</h2><a href="/automations">See all →</a></div>
  <div class="grid">${featured}</div>
</section>

<section class="wrap section band">
  <div>
    <h2>Honest, per-run pricing</h2>
    <p class="muted">We pass through model costs with a simple markup. Most runs cost less than a cent. Top up from $5.</p>
  </div>
  <a class="btn" href="/pricing">See pricing</a>
</section>`,
  });
}

export function catalog({ user, category }) {
  const list = category ? AUTOMATIONS.filter((a) => a.category === category) : AUTOMATIONS;
  const tab = (c, label) => `<a class="tab" href="/automations${c ? `?category=${encodeURIComponent(c)}` : ''}"${(category || '') === c ? ' aria-current="true"' : ''}>${label}</a>`;
  return layout({
    title: 'Automations',
    user,
    active: '/automations',
    body: `
<section class="wrap page-head">
  <h1>Automations</h1>
  <p class="lede">All free. Each one runs in the Shortcuts app and calls our API with your key.</p>
  <div class="tabs">${tab('', 'All')}${CATEGORIES.map((c) => tab(c, c)).join('')}</div>
</section>
<section class="wrap"><div class="grid">${list.map(card).join('')}</div></section>`,
  });
}

export function automationDetail({ user, a, apiUrl }) {
  const steps = a.steps.map((s, i) => `
    <li><span class="step-n">${i + 1}</span><div><strong>${e(s.action)}</strong>${s.detail ? `<p class="muted">${e(s.detail.replace('{{API_URL}}', apiUrl))}</p>` : ''}</div></li>`).join('');
  const body = JSON.stringify({ prompt: a.prompt, input: '<Shortcut Input>', model: a.model }, null, 2);
  return layout({
    title: a.name,
    user,
    active: '/automations',
    body: `
<section class="wrap detail">
  <a class="small muted" href="/automations">← All automations</a>
  <div class="detail-head">
    <span class="chip">${e(a.category)}</span>
    <h1>${e(a.name)}</h1>
    <p class="lede">${e(a.tagline)}</p>
    <dl class="facts">
      <div><dt>Runs from</dt><dd>${e(a.trigger)}</dd></div>
      <div><dt>Model</dt><dd>${e(MODELS[a.model].label)}</dd></div>
      <div><dt>Typical cost</dt><dd>≈ $${a.typicalCost.toFixed(3)} per run</dd></div>
    </dl>
  </div>
  <div class="detail-grid">
    <div>
      <h2>Build it in Shortcuts</h2>
      <ol class="steps-list">${steps}</ol>
    </div>
    <aside class="panel">
      <h3>Request body</h3>
      <pre><code>${e(body)}</code></pre>
      <p class="small muted">Set the method to POST, Request Body to JSON, and add the header <code>Authorization: Bearer YOUR_KEY</code>.</p>
      ${user ? '<a class="btn btn-block" href="/account#keys">Get your API key</a>' : '<a class="btn btn-block" href="/signup">Create an account to get a key</a>'}
    </aside>
  </div>
</section>`,
  });
}

export function pricing({ user }) {
  const rows = Object.entries(MODELS).map(([id, m]) => {
    const p = retailPrice(id);
    return `<tr><td>${e(m.label)}<div class="small muted mono">${id}</div></td><td>$${p.input.toFixed(2)}</td><td>$${p.output.toFixed(2)}</td></tr>`;
  }).join('');
  return layout({
    title: 'Pricing',
    user,
    active: '/pricing',
    body: `
<section class="wrap page-head narrow">
  <h1>Pricing</h1>
  <p class="lede">Automations are free. AI usage is billed per token from your prepaid balance. Credit never expires.</p>
  <table class="table">
    <thead><tr><th>Model</th><th>Input / 1M tokens</th><th>Output / 1M tokens</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="small muted">A typical automation run uses a few hundred tokens, which is usually well under one cent. Top-ups: ${TOPUP_AMOUNTS.map((d) => `$${d}`).join(', ')}.</p>
</section>`,
  });
}

export function authPage({ mode, error, email = '', next = '' }) {
  const isLogin = mode === 'login';
  return layout({
    title: isLogin ? 'Log in' : 'Create account',
    active: isLogin ? '/login' : '',
    body: `
<section class="wrap auth">
  <form class="auth-card" method="post" action="/${mode}">
    <h1>${isLogin ? 'Welcome back' : 'Create your account'}</h1>
    <p class="muted">${isLogin ? 'Log in to manage your balance and keys.' : 'Free forever. Add credit only when you want AI.'}</p>
    ${error ? `<p class="alert" role="alert">${e(error)}</p>` : ''}
    <input type="hidden" name="next" value="${e(next)}">
    <label>Email<input name="email" type="email" autocomplete="email" required value="${e(email)}"></label>
    <label>Password<input name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" minlength="10" required></label>
    <button class="btn btn-block" type="submit">${isLogin ? 'Log in' : 'Create account'}</button>
    <p class="small muted center">${isLogin ? 'New here? <a href="/signup">Create an account</a>' : 'Have an account? <a href="/login">Log in</a>'}</p>
  </form>
</section>`,
  });
}

export function account({ user, keys, history, newKey, notice, billingEnabled, inferenceEnabled, apiUrl }) {
  const topups = TOPUP_AMOUNTS.map((d) => `
    <form method="post" action="/account/topup">
      <input type="hidden" name="csrf" value="${e(user.csrf)}">
      <input type="hidden" name="amount" value="${d}">
      <button class="amount" type="submit"${billingEnabled ? '' : ' disabled'}>$${d}</button>
    </form>`).join('');
  const keyRows = keys.length ? keys.map((k) => `
    <li class="key-row">
      <div><strong>${e(k.name)}</strong><div class="small muted mono">${e(k.prefix)}…  ·  created ${date(k.created_at)}${k.last_used_at ? `  ·  last used ${date(k.last_used_at)}` : ''}</div></div>
      <form method="post" action="/account/keys/${k.id}/revoke"><input type="hidden" name="csrf" value="${e(user.csrf)}"><button class="btn btn-ghost btn-sm" type="submit">Revoke</button></form>
    </li>`).join('') : '<li class="muted small">No keys yet.</li>';
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
    <div><h1>Account</h1><p class="muted">${e(user.email)}</p></div>
    <form method="post" action="/logout"><input type="hidden" name="csrf" value="${e(user.csrf)}"><button class="btn btn-ghost btn-sm" type="submit">Log out</button></form>
  </div>
  ${notice ? `<p class="notice ${notice.tone}">${e(notice.text)}</p>` : ''}
</section>
<section class="wrap account-grid">
  <div class="panel balance">
    <span class="small muted">Balance</span>
    <div class="big">${formatUsd(user.balance_micros)}</div>
    <span class="small muted">Add credit</span>
    <div class="amounts">${topups}</div>
    <p class="small muted">${billingEnabled ? 'Secure checkout by Stripe. Credit never expires.' : 'Payments are not configured on this server yet.'}</p>
  </div>

  <div class="panel" id="keys">
    <h2>API keys</h2>
    <p class="small muted">Paste a key into your shortcut's Authorization header. Keys spend from your balance.</p>
    ${newKey ? `<div class="newkey"><span class="small">Copy this key now. You won't see it again.</span><code class="mono">${e(newKey)}</code></div>` : ''}
    <ul class="keys">${keyRows}</ul>
    <form class="inline-form" method="post" action="/account/keys">
      <input type="hidden" name="csrf" value="${e(user.csrf)}">
      <input name="name" placeholder="Key name, e.g. My iPhone" maxlength="60" required>
      <button class="btn btn-sm" type="submit">Create key</button>
    </form>
    <p class="small muted">Endpoint: <code>${e(apiUrl)}</code>${inferenceEnabled ? '' : ' (inference not configured on this server yet)'}</p>
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
  body: '<section class="wrap page-head narrow"><h1>Not found</h1><p class="lede">That page does not exist. <a href="/automations">Browse automations</a>.</p></section>',
});
