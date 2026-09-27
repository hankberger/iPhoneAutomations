import { AUTOMATIONS, CATEGORIES } from './catalog.js';
import { MODELS, retailPrice } from './inference.js';
import { TOPUP_AMOUNTS, formatUsd, MICROS } from './billing.js';

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
  plus: '<path d="M12 5v14M5 12h14"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
};
export const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

export function layout({ title, user, body, active = '' }) {
  const nav = (href, label) => `<a href="${href}"${active === href ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title ? `${title} · Advanced Automations` : 'Advanced Automations: free AI Shortcuts for iPhone')}</title>
<meta name="description" content="Free iPhone Shortcuts with a little AI inside. Tap Get, add it to the Shortcuts app, and run it from anywhere. No subscription.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/bricolage.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="site-header">
  <div class="wrap row">
    <a class="brand" href="/"><i class="mark"></i><span>Advanced Automations</span></a>
    <nav class="nav">
      ${nav('/automations', 'Shortcuts')}
      ${nav('/pricing', 'Pricing')}
      ${user ? `<a class="btn btn-sm" href="/account">Account</a>` : `${nav('/login', 'Log in')}<a class="btn btn-sm" href="/automations">Get shortcuts</a>`}
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
    <span class="meta"><span>${e(a.trigger)} · ~${cents(a.typicalCost)}</span><span class="get">Get</span></span>
  </a>`;

const tile = (a, extra = '') => `<a class="tile c-${a.color}${extra}" href="/automations/${a.slug}">${icon(a.icon)}<span>${e(a.name)}</span></a>`;

export const starterCents = (micros) => `${Math.round(micros / 10_000)}¢`;
const installHref = (a, user) => (user ? `/automations/${a.slug}/install` : `/signup?next=${encodeURIComponent(`/automations/${a.slug}/install`)}`);

export function landing({ user, starterMicros }) {
  const [sum, reply, tone, voice, remind, receipt, translate, brief] = AUTOMATIONS;
  return layout({
    user,
    body: `
<section class="hero wrap">
  <div>
    <h1>Make your iPhone do the <mark>boring bits.</mark></h1>
    <p class="lede">Free Shortcuts with a little AI inside. Tap Get, add it to the Shortcuts app, and run it from the Share Sheet, Siri or the Action Button.</p>
    <div class="cta">
      <a class="btn btn-lg" href="#shortcuts">Browse shortcuts</a>
      <a class="link" href="#how">How it works →</a>
    </div>
    ${starterMicros ? `<p class="small muted hero-note">Sign in with Apple and your first ${starterCents(starterMicros)} of AI is on us.</p>` : ''}
  </div>
  <div class="tiles" aria-label="Featured shortcuts">
    ${tile(sum)}${tile(reply, ' tilt-r')}${tile(voice)}
    ${tile(remind, ' tilt-l')}${tile(receipt)}${tile(translate)}
    <div class="tile tile-result"><div><b>Summarize Anything</b>Launch moves to Oct 14. Design review Thursday. Budget unchanged.</div><small>Llama 3.3 70B · $0.0006</small></div>
    ${tile(brief, ' tilt-r')}
  </div>
</section>

<section class="wrap section center" id="shortcuts">
  <h2>Pick one. It’s on your phone in a minute.</h2>
  <p class="muted">Every shortcut is free. You only pay for the AI it uses, usually well under a cent a run.</p>
  <div class="grid">${[sum, reply, voice, remind, receipt, translate, brief, tone].map(card).join('')}</div>
</section>

<section class="wrap how" id="how">
  <div><b>1</b><h3>Tap Get</h3><p>Pick a shortcut and sign in with Apple. It takes one tap.</p></div>
  <div><b>2</b><h3>Add to Shortcuts</h3><p>The Shortcuts app asks for your key. We’ve already copied it, so just paste.</p></div>
  <div><b>3</b><h3>Run it anywhere</h3><p>Share Sheet, Back Tap, Action Button or Siri. Top up whenever your credit runs low.</p></div>
</section>

<section class="wrap stats">
  <div><b>$0</b><p>for every shortcut, forever</p></div>
  <div><b>${starterMicros ? starterCents(starterMicros) : '&lt;1¢'}</b><p>${starterMicros ? 'free credit when you sign in with Apple or Google' : 'typical cost of one run'}</p></div>
  <div><b>&lt;1¢</b><p>typical cost of one run, no subscription</p></div>
</section>`,
  });
}

export function catalog({ user, category }) {
  const list = category ? AUTOMATIONS.filter((a) => a.category === category) : AUTOMATIONS;
  const chip = (c, label) => `<a class="chip" href="/automations${c ? `?category=${encodeURIComponent(c)}` : ''}"${(category || '') === c ? ' aria-current="true"' : ''}>${label}</a>`;
  return layout({
    title: 'Shortcuts',
    user,
    active: '/automations',
    body: `
<section class="wrap page-head center">
  <h1>Shortcuts</h1>
  <p class="lede">All free. Tap one, then Add to Shortcuts. You only pay for the AI each run uses.</p>
  <div class="chips">${chip('', 'All')}${CATEGORIES.map((c) => chip(c, c)).join('')}</div>
</section>
<section class="wrap"><div class="grid">${list.map(card).join('')}</div></section>`,
  });
}

export function automationDetail({ user, a, apiUrl, starterMicros }) {
  const inside = a.inside.map((s, i) => `
    <li><span class="step-n">${i + 1}</span><div><strong>${e(s.action)}</strong>${s.detail ? `<p>${e(s.detail)}</p>` : ''}</div></li>`).join('');
  const runUrl = apiUrl.replace('/generate', `/run/${a.slug}`);
  const example = `curl ${runUrl} \\\n  -H "Authorization: Bearer YOUR_KEY" \\\n  -d '{"input": "…"${a.choices ? `, "choice": "${a.choices[0]}"` : ''}}'`;
  return layout({
    title: a.name,
    user,
    active: '/automations',
    body: `
<section class="wrap detail">
  <a class="link small" href="/automations">← All shortcuts</a>
  <div class="detail-head c-${a.color}">
    <span class="big-ic">${icon(a.icon)}</span>
    <div class="grow">
      <h1>${e(a.name)}</h1>
      <p class="lede">${e(a.tagline)}</p>
      <div class="get-row">
        <a class="btn btn-lg btn-get" href="${installHref(a, user)}">${icon('plus')}<span>${user ? 'Add to Shortcuts' : 'Get it free'}</span></a>
        <p class="small muted">${user ? 'Free. Each run costs about ' + cents(a.typicalCost) + ' from your balance.' : `Free. Sign in with Apple${starterMicros ? ` and start with ${starterCents(starterMicros)} of credit` : ''}.`}</p>
      </div>
      <dl class="facts">
        <div><dt>Runs from</dt><dd>${e(a.trigger)}</dd></div>
        <div><dt>Model</dt><dd>${e(MODELS[a.model].label)}</dd></div>
        <div><dt>Typical cost</dt><dd>~${cents(a.typicalCost)} per run</dd></div>
      </dl>
    </div>
  </div>
  <div class="detail-grid">
    <div>
      <h2>How to use it</h2>
      <p class="tip">${e(a.runTip)}</p>
      <h2 class="inside-h">What’s inside</h2>
      <ol class="steps-list">${inside}</ol>
    </div>
    <aside class="panel">
      <h3>How adding works</h3>
      <ol class="mini-steps">
        <li>Tap <strong>${user ? 'Add to Shortcuts' : 'Get it free'}</strong>${user ? '' : ' and sign in'}.</li>
        <li>We copy a key for this shortcut to your clipboard and open the Shortcuts app.</li>
        <li>When Shortcuts asks for your key, paste it and tap <strong>Add Shortcut</strong>.</li>
      </ol>
      <details class="dev">
        <summary>Call it from your own code</summary>
        <pre><code>${e(example)}</code></pre>
      </details>
    </aside>
  </div>
</section>`,
  });
}

export function install({ user, a, key, balance, fileUrl }) {
  const importUrl = `shortcuts://import-shortcut?url=${encodeURIComponent(fileUrl)}&name=${encodeURIComponent(a.name)}`;
  const runs = a.typicalCost > 0 ? Math.floor(balance / MICROS / a.typicalCost) : 0;
  return layout({
    title: `Add ${a.name}`,
    user,
    body: `
<section class="wrap install">
  <a class="link small" href="/automations/${a.slug}">← ${e(a.name)}</a>
  <div class="install-card c-${a.color}">
    <span class="big-ic">${icon(a.icon)}</span>
    <h1>Add ${e(a.name)}</h1>
    <p class="muted">One tap copies your key and opens Shortcuts. When it asks for the key, paste it and tap Add Shortcut.</p>
    <div class="keybox">
      <span class="small muted">Your key for this shortcut</span>
      <code id="key">${e(key)}</code>
    </div>
    <a class="btn btn-lg btn-block btn-get" id="add" href="${e(importUrl)}" data-key="${e(key)}">${icon('copy')}<span>Copy key and open Shortcuts</span></a>
    <p class="small muted center" id="add-status" role="status">Not opening? <a href="${e(fileUrl)}">Download the shortcut</a> instead.</p>
  </div>

  <ol class="install-steps">
    <li><b>1</b><div><h3>Paste when asked</h3><p>Shortcuts shows “Set Up This Shortcut” with a box for your key. Tap it, paste, then tap <strong>Add Shortcut</strong>.</p></div></li>
    <li><b>2</b><div><h3>Run it</h3><p>${e(a.runTip)}</p></div></li>
    <li><b>3</b><div><h3>Keep it topped up</h3><p>${balance > 0 ? `You have ${formatUsd(balance)} of credit, enough for about ${runs.toLocaleString('en-US')} runs of this shortcut.` : 'Your balance is empty, so add a little credit before the first run.'} <a href="/account#balance">${balance > 0 ? 'See your balance' : 'Top up'}</a></p></div></li>
  </ol>
  <p class="small muted center desktop-only">On a computer? Open iphoneadvanced.com on your iPhone and tap Get there instead.</p>
</section>
<script src="/install.js" defer></script>`,
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

export function authPage({ mode, error, email = '', next = '', providers = [], starterMicros = 0 }) {
  const isLogin = mode === 'login';
  const getting = AUTOMATIONS.find((a) => next === `/automations/${a.slug}/install`);
  const credit = starterMicros && providers.length ? ` Sign in with ${providers.map((p) => p.name).join(' or ')} and start with ${starterCents(starterMicros)} of free credit.` : '';
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
  <div class="auth-tiles" aria-hidden="true">${(getting ? [getting] : AUTOMATIONS.slice(0, 4)).map((a) => `<span class="mini c-${a.color}">${icon(a.icon)}</span>`).join('')}</div>
  <form class="auth-card" method="post" action="/${mode}">
    <h1>${getting ? `Get ${e(getting.name)}` : isLogin ? 'Welcome back' : 'Create your account'}</h1>
    <p class="muted">${getting ? `Sign in once and it’s yours.${credit}` : isLogin ? 'Log in to manage your balance and shortcuts.' : `Every shortcut is free.${credit}`}</p>
    ${error ? `<p class="alert" role="alert">${e(error)}</p>` : ''}${social}
    <input type="hidden" name="next" value="${e(next)}">
    <label>Email<input name="email" type="email" autocomplete="email" required value="${e(email)}"></label>
    <label>Password<input name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" minlength="10" required></label>
    <button class="btn btn-lg btn-block" type="submit">${isLogin ? 'Log in' : 'Create account'}</button>
    <p class="small muted center">${isLogin ? `New here? <a href="/signup${e(nextQuery)}">Create an account</a>` : `Have an account? <a href="/login${e(nextQuery)}">Log in</a>`}</p>
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
    </li>`).join('') : '<li class="muted small empty">Nothing added yet. <a href="/automations">Browse shortcuts</a> and tap Get.</li>';
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
  <div class="panel balance" id="balance">
    <span class="label">Balance</span>
    <div class="big">${formatUsd(user.balance_micros)}</div>
    <span class="label">Add credit</span>
    <div class="amounts">${topups}</div>
    <p class="small">${billingEnabled ? 'Secure checkout by Stripe. Credit never expires.' : 'Payments are not configured on this server yet.'}</p>
  </div>

  <div class="panel" id="keys">
    <h2>Your shortcuts</h2>
    <p class="small muted">Each shortcut you add gets its own key, and every run spends from your balance. Revoke a key to disconnect that shortcut.</p>
    ${newKey ? `<div class="newkey"><span class="small">Copy this key now. You won’t see it again.</span><code>${e(newKey)}</code></div>` : ''}
    <ul class="keys">${keyRows}</ul>
    <a class="btn btn-sm" href="/automations">${icon('plus')}<span>Add a shortcut</span></a>
    <details class="dev">
      <summary>Make a key for your own code</summary>
      <form class="inline-form" method="post" action="/account/keys">
        <input type="hidden" name="csrf" value="${e(user.csrf)}">
        <input name="name" placeholder="Key name, e.g. My script" maxlength="60" required>
        <button class="btn btn-sm" type="submit">Create key</button>
      </form>
      <p class="small muted">Endpoint <code>${e(apiUrl)}</code>, or <code>${e(apiUrl.replace('/generate', '/ai/run/{model}'))}</code> for the raw Cloudflare format${inferenceEnabled ? '' : ' (inference not configured on this server yet)'}</p>
    </details>
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
  body: '<section class="wrap page-head center"><h1>Nothing here</h1><p class="lede">That page does not exist. <a href="/automations">Browse shortcuts</a>.</p></section>',
});
