import { AUTOMATIONS, CATEGORIES, findAutomation } from './catalog.js';
import { MODELS, retailPrice } from './inference.js';
import { TOPUP_AMOUNTS, formatUsd } from './billing.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const date = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

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
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  wave: '<path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10M21 12h0"/>',
  apple: '<path d="M12 7c-1.5-1-5-1.5-6.5 1.5S5 16 7 19c1.2 1.8 2.8 2 5 1 2.2 1 3.8.8 5-1 2-3 2.5-7.5 1-10.5S13.5 6 12 7z"/><path d="M12 7c0-2 1-3.5 3-4"/>',
  shield: '<path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6z"/><path d="M12 8v4M12 15.5v.5"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
};
export const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k]}</svg>`;

// Grid spark mark; same drawing as public/favicon.svg.
const LOGO = '<svg class="mark" aria-hidden="true" viewBox="0 0 32 32"><rect x="1" y="1" width="13.5" height="13.5" rx="4" fill="#ff6b3d"/><path d="M24.75 .5c.8 4.9 2.35 6.45 7.25 7.25-4.9.8-6.45 2.35-7.25 7.25-.8-4.9-2.35-6.45-7.25-7.25 4.9-.8 6.45-2.35 7.25-7.25z" fill="#7c5cff"/><rect x="1" y="17.5" width="13.5" height="13.5" rx="4" fill="#10b981"/><rect x="17.5" y="17.5" width="13.5" height="13.5" rx="4" fill="#0ea5e9"/></svg>';

export function layout({ title, user, body, active = '', stylesheet = '', appMode = false }) {
  const nav = (href, label) => `<a href="${href}"${active === href ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title ? `${title} · Advanced Automations` : 'Advanced Automations: AI building blocks for iOS Shortcuts')}</title>
<meta name="description" content="AI building blocks for iOS Shortcuts. Drop Ask AI, Transcribe Audio, Pick a Category and more into any shortcut you build. Pay only for the AI you use.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#fbfbfa">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Advanced Automations">
<meta property="og:title" content="${e(title ? `${title} · Advanced Automations` : 'Advanced Automations: AI building blocks for iOS Shortcuts')}">
<meta property="og:description" content="AI building blocks for iOS Shortcuts. Drop Ask AI, Transcribe Audio, Pick a Category and more into any shortcut you build. Pay only for the AI you use.">
<meta property="og:image" content="https://iphoneadvanced.com/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preload" href="/fonts/bricolage.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/styles.css">
${stylesheet ? `<link rel="stylesheet" href="${e(stylesheet)}">` : ''}
</head>
<body>
<header class="site-header">
  <div class="wrap row">
    <a class="brand" href="${appMode ? '/app/privacy' : '/'}">${LOGO}<span>Advanced Automations</span></a>
    ${appMode ? '' : `<nav class="nav">
      ${nav('/automations', 'Blocks')}
      ${nav('/pricing', 'Pricing')}
      ${user?.is_admin ? nav('/admin', 'Analytics') : ''}
      ${user ? `<a class="btn btn-sm" href="/account">Account</a>` : `<a class="btn btn-sm" href="/login">Log in</a>`}
    </nav>`}
  </div>
</header>
<main>${body}</main>
<footer class="site-footer">
  <div class="wrap row">
    <span class="brand small">${LOGO}<span>Advanced Automations</span></span>
    <nav class="footer-links small">${appMode ? '<a href="/app/terms">Terms</a><a href="/app/privacy">Privacy</a>' : '<a href="/pricing">Pricing</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a>'}</nav>
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
    <span class="meta"><span>${e(a.input || a.trigger)}${a.output ? ` → ${e(a.output)}` : ''}</span><span class="get">Get</span></span>
  </a>`;

const tile = (a, extra = '') => `<a class="tile c-${a.color}${extra}" href="/automations/${a.slug}">${icon(a.icon)}<span>${e(a.name)}</span></a>`;

const installHref = (a, user) => (user ? `/automations/${a.slug}/install` : `/signup?next=${encodeURIComponent(`/automations/${a.slug}/install`)}`);

const blockChip = (a, note = '') => `<li class="step blk c-${a.color}">${icon(a.icon)}<span>${e(a.name)}${note ? ` <small>${e(note)}</small>` : ''}</span></li>`;
const plainStep = (label) => `<li class="step">${e(label)}</li>`;

// Example shortcuts built from the blocks, shown on the landing page. Each step is either a
// built-in Shortcuts action (a string) or [block slug, what you tell it].
const RECIPES = [
  { name: 'Sort my inbox', how: 'Share an email and get pinged only when it matters.', steps: ['Receive email from Share Sheet', ['pick-a-category', '"Urgent, Needs reply, FYI"'], 'If Result is Urgent', 'Show Notification'] },
  { name: 'Receipt to log', how: 'Snap a receipt and keep a running expense note.', steps: ['Take Photo', ['pull-out-details', '"total, date, store"'], 'Get Dictionary Value total', 'Append to Note'] },
  { name: 'Voice memo to-dos', how: 'Ramble for a minute, keep only the action items.', steps: ['Record Audio', ['transcribe-audio'], ['ask-ai', '"List only the action items"'], 'Create Reminder'] },
  { name: 'What is this error?', how: 'Back Tap on any screen for a plain answer.', steps: ['Take Screenshot', ['ask-about-image', '"What does this error mean?"'], 'Show Result'] },
];

const recipeCard = (r) => `
  <div class="recipe">
    <h3>${e(r.name)}</h3>
    <p class="small muted">${e(r.how)}</p>
    <ol class="steps">${r.steps.map((s) => (Array.isArray(s) ? blockChip(findAutomation(s[0]), s[1]) : plainStep(s))).join('')}</ol>
  </div>`;

export function landing({ user }) {
  const blocks = AUTOMATIONS.filter((a) => a.block);
  const ask = findAutomation('ask-ai');
  const ready = ['meeting-notes', 'reply-drafter', 'snap-calories', 'summarize-anything', 'explain-this', 'scam-check', 'translate-selection', 'receipt-reader'].map(findAutomation);
  return layout({
    user,
    body: `
<section class="hero wrap">
  <div>
    <h1>AI building blocks for <mark>iOS Shortcuts.</mark></h1>
    <p class="lede">Give any shortcut real intelligence. Ask questions, read photos and screenshots, transcribe recordings, pull clean data out of anything and make images, each as a single step you drop into the shortcuts you build.</p>
    <div class="cta">
      <a class="btn btn-lg" href="#blocks">Get the blocks</a>
      <a class="link" href="#recipes">See what you can build →</a>
    </div>
  </div>
  <div class="tiles" aria-label="The building blocks">
    ${blocks.map((a, i) => tile(a, i === 1 ? ' tilt-r' : i === 3 ? ' tilt-l' : '')).join('')}
    <div class="tile tile-result tile-recipe">
      <span class="small recipe-label">Your shortcut</span>
      <ol class="steps">${plainStep('Get Clipboard')}${blockChip(ask, '"Summarize in three lines"')}${plainStep('Show Result')}</ol>
    </div>
  </div>
</section>

<section class="wrap section center" id="blocks">
  <h2>Serious AI, as easy as any other action.</h2>
  <p class="muted">Each block puts a capable model behind one Run Shortcut step. It sees images, hears audio, returns a Dictionary you can read field by field, and answers with exactly one of your choices so your If just works. More blocks are on the way.</p>
  <div class="grid grid-3">${blocks.map(card).join('')}</div>
</section>

<section class="wrap section center" id="recipes">
  <h2>Snap them together.</h2>
  <p class="muted">A few shortcuts people build in a couple of minutes. Colored steps are blocks; the rest come with the Shortcuts app.</p>
  <div class="recipes">${RECIPES.map(recipeCard).join('')}</div>
</section>

<section class="wrap how" id="how">
  <div><b>1</b><h3>Get the blocks</h3><p>Tap Get on the ones you want and sign in with Apple. Each block gets its own key, already copied.</p></div>
  <div><b>2</b><h3>Drop them in</h3><p>In any shortcut, add Run Shortcut and pick a block. Pass it a List: what to work on, then your instructions.</p></div>
  <div><b>3</b><h3>Run it anywhere</h3><p>Share Sheet, Back Tap, Action Button or Siri. Top up whenever your credit runs low.</p></div>
</section>

<section class="wrap section center" id="shortcuts">
  <h2>Rather not build? Grab one ready-made.</h2>
  <p class="muted">Finished shortcuts with the same AI inside. Add one and run it as is.</p>
  <div class="grid">${ready.map(card).join('')}</div>
  <p class="see-all"><a class="link" href="/automations">See everything →</a></p>
</section>`,
  });
}

export function catalog({ user, category, query = '' }) {
  const normalized = query.trim().toLowerCase();
  const list = AUTOMATIONS.filter((a) => {
    if (category && a.category !== category) return false;
    if (!normalized) return true;
    return [a.name, a.tagline, a.category, a.trigger, a.input, a.output, ...(a.tags || [])]
      .filter(Boolean).join(' ').toLowerCase().includes(normalized);
  });
  const href = (c = category, q = query) => {
    const params = new URLSearchParams();
    if (c) params.set('category', c);
    if (q) params.set('q', q);
    const suffix = params.toString();
    return `/automations${suffix ? `?${suffix}` : ''}`;
  };
  const chip = (c, label) => `<a class="chip" href="${href(c)}"${(category || '') === c ? ' aria-current="true"' : ''}>${label}</a>`;
  const grid = (items, extra = '') => `<div class="grid${extra}">${items.map(card).join('')}</div>`;
  const body = category || normalized
    ? `<section class="wrap">
  ${normalized ? `<p class="small muted">${list.length} result${list.length === 1 ? '' : 's'} for “${e(query)}”</p>` : ''}
  ${list.length ? grid(list) : '<p class="empty-state">Nothing matches that search. Try “photo”, “meeting”, “write” or “tasks”.</p>'}
</section>`
    : `<section class="wrap">
  <h2 class="cat-h">Building blocks</h2>
  <p class="muted">Add them to your own shortcuts with Run Shortcut.</p>
  ${grid(AUTOMATIONS.filter((a) => a.block), ' grid-3')}
</section>
<section class="wrap section-sm">
  <h2 class="cat-h">Ready-made shortcuts</h2>
  <p class="muted">Finished shortcuts you can run as is.</p>
  ${grid(AUTOMATIONS.filter((a) => !a.block))}
</section>`;
  return layout({
    title: 'Blocks',
    user,
    active: '/automations',
    body: `
<section class="wrap page-head center">
  <h1>AI blocks for Shortcuts</h1>
  <p class="lede">Drop a block into any shortcut you build, or grab a ready-made one. You only pay for the AI each run uses.</p>
  <form class="catalog-search" action="/automations" method="get" role="search">
    ${category ? `<input type="hidden" name="category" value="${e(category)}">` : ''}
    <input type="search" name="q" value="${e(query)}" placeholder="Search by task, input or outcome" aria-label="Search blocks and shortcuts">
    <button class="btn btn-sm" type="submit">Search</button>
  </form>
  <div class="chips">${chip('', 'All')}${CATEGORIES.map((c) => chip(c, c)).join('')}</div>
</section>
${body}`,
  });
}

export function automationDetail({ user, a, apiUrl }) {
  const inside = a.inside.map((s, i) => `
    <li><span class="step-n">${i + 1}</span><div><strong>${e(s.action)}</strong>${s.detail ? `<p>${e(s.detail)}</p>` : ''}</div></li>`).join('');
  const runUrl = apiUrl.replace('/generate', `/run/${a.slug}`);
  const example = a.audio
    ? `curl ${runUrl} \\\n  -H "Authorization: Bearer YOUR_KEY" \\\n  --data-binary @meeting.m4a`
    : `curl ${runUrl} \\\n  -H "Authorization: Bearer YOUR_KEY" \\\n  -d '{"input": "…"${a.choices ? `, "choice": "${a.choices[0]}"` : ''}${a.image ? ', "image": "<base64 JPEG>"' : ''}${a.block && !a.makesImage ? ', "instructions": "…"' : ''}}'`;
  return layout({
    title: a.name,
    user,
    active: '/automations',
    body: `
<section class="wrap detail">
  <a class="link small" href="/automations">← ${a.block ? 'All blocks' : 'All blocks and shortcuts'}</a>
  <div class="detail-head c-${a.color}">
    <span class="big-ic">${icon(a.icon)}</span>
    <div class="grow">
      <h1>${e(a.name)}</h1>
      <p class="lede">${e(a.tagline)}</p>
      <div class="get-row">
        <a class="btn btn-lg btn-get" href="${installHref(a, user)}">${icon('plus')}<span>${user ? 'Add to Shortcuts' : 'Get it'}</span></a>
        <p class="small muted">${user ? 'Each run spends from your balance.' : 'Sign in with Apple to add it.'}</p>
      </div>
      <dl class="facts">
        <div><dt>Runs from</dt><dd>${e(a.trigger)}</dd></div>
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
        <li>Tap <strong>${user ? 'Add to Shortcuts' : 'Get it'}</strong>${user ? '' : ' and sign in'}.</li>
        <li>We copy a key for this shortcut to your clipboard and open the Shortcuts app.</li>
        <li>Tap <strong>Add Shortcut</strong>, then paste the key the first time you run it.</li>
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

// iOS only imports straight into Shortcuts from an iCloud share link (shortcuts://import-shortcut
// refuses any other URL). Until an automation has one, the signed file is downloaded and opened.
export function install({ user, a, key, balance, fileUrl }) {
  const icloud = Boolean(a.icloudUrl);
  const href = icloud ? a.icloudUrl : fileUrl;
  return layout({
    title: `Add ${a.name}`,
    user,
    body: `
<section class="wrap install">
  <a class="link small" href="/automations/${a.slug}">← ${e(a.name)}</a>
  <div class="install-card c-${a.color}">
    <span class="big-ic">${icon(a.icon)}</span>
    <h1>Add ${e(a.name)}</h1>
    <p class="muted">${icloud ? 'One tap copies your key and opens Shortcuts.' : 'One tap copies your key and downloads the shortcut. Open the download and Shortcuts takes over.'} Tap Add Shortcut, and paste the key the first time you run it.</p>
    <div class="keybox">
      <span class="small muted">Your key for this shortcut</span>
      <code id="key">${e(key)}</code>
    </div>
    <a class="btn btn-lg btn-block btn-get" id="add" href="${e(href)}" data-key="${e(key)}" data-going="${icloud ? 'Key copied. Opening Shortcuts…' : 'Key copied. Downloading…'}">${icon('copy')}<span>${icloud ? 'Copy key and open Shortcuts' : 'Copy key and download'}</span></a>
    <p class="small muted center" id="add-status" role="status">${icloud ? `Not opening? <a href="${e(fileUrl)}">Download the shortcut</a> instead.` : 'Safari asks to download it: tap Download.'}</p>
  </div>

  <ol class="install-steps">
    ${icloud ? '' : `<li><b>1</b><div><h3>Open the download</h3><p>Tap the download arrow in Safari’s address bar, then tap <strong>${e(a.name)}</strong>. It opens in Shortcuts.</p></div></li>`}
    <li><b>${icloud ? 1 : 2}</b><div><h3>Add it, then paste once</h3><p>Tap <strong>Add Shortcut</strong>. The first time it runs, it asks for your key: paste it and tap Done. Every Advanced Automations shortcut shares it, so you only do this once.</p></div></li>
    <li><b>${icloud ? 2 : 3}</b><div><h3>Run it</h3><p>${e(a.runTip)}</p></div></li>
    <li><b>${icloud ? 3 : 4}</b><div><h3>Keep it topped up</h3><p>${balance > 0 ? `You have ${formatUsd(balance)} of credit.` : 'Your balance is empty, so add a little credit before the first run.'} <a href="/account#balance">${balance > 0 ? 'See your balance' : 'Top up'}</a></p></div></li>
  </ol>
  <p class="small muted center desktop-only">On a computer? Open iphoneadvanced.com on your iPhone and tap Get there instead.</p>
</section>
<script src="/install.js" defer></script>`,
  });
}

export function appConnect({ user, state }) {
  return layout({
    appMode: true,
    title: 'Connect the app',
    user,
    body: `
<section class="wrap install">
  <div class="install-card c-violet">
    <span class="big-ic">${icon('key')}</span>
    <h1>Connect the iPhone app</h1>
    <p class="muted">Signed in as ${e(user.email)}. The app gets its own key, which it uses for the AI actions it adds to Shortcuts. Revoke it any time from your account.</p>
    <p class="muted">Only tap Connect if you started this from the Advanced Automations app.</p>
    <form method="post" action="/app/connect">
      <input type="hidden" name="csrf" value="${e(user.csrf)}">
      <input type="hidden" name="state" value="${e(state)}">
      <button class="btn btn-lg btn-block" type="submit">Connect</button>
    </form>
  </div>
</section>`,
  });
}

export function pricing({ user, appMode = false }) {
  const rows = Object.entries(MODELS).map(([id, m]) => {
    const p = retailPrice(id);
    return `<tr><td><strong>${e(m.tier)}</strong></td><td class="num">$${p.input.toFixed(2)}</td><td class="num">$${p.output.toFixed(2)}</td></tr>`;
  }).join('');
  return layout({
    title: 'Pricing',
    appMode,
    user,
    active: '/pricing',
    body: `
<section class="wrap page-head center">
  <h1>Simple pricing</h1>
  <p class="lede">Pay only for the AI your blocks and shortcuts use, from a balance you top up. Credit never expires.</p>
</section>
<section class="wrap narrow">
  <div class="panel">
    <h2>Per-token rates</h2>
    <table class="table">
      <thead><tr><th>AI</th><th class="num">Input / 1M tokens</th><th class="num">Output / 1M tokens</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="small muted">Top-ups: ${TOPUP_AMOUNTS.map((d) => `$${d}`).join(', ')}.</p>
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
  const appMode = next.startsWith('/app/connect');
  if (appMode && !providers.some(p => p.id === 'apple')) providers = [];
  const isLogin = mode === 'login';
  const getting = AUTOMATIONS.find((a) => next === `/automations/${a.slug}/install`);
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : '';
  const social = providers.length ? `
    <div class="oauth">${providers.map((p) => `
      <a class="btn btn-lg btn-block oauth-${p.id}" href="/auth/${p.id}${e(nextQuery)}">${PROVIDER_LOGOS[p.id] || ''}<span>Continue with ${e(p.name)}</span></a>`).join('')}
    </div>
    <p class="divider small muted"><span>or use email</span></p>` : '';
  return layout({
    title: isLogin ? 'Log in' : 'Create account',
    appMode,
    active: isLogin ? '/login' : '',
    body: `
<section class="wrap auth">
  <div class="auth-tiles" aria-hidden="true">${(getting ? [getting] : AUTOMATIONS.slice(0, 4)).map((a) => `<span class="mini c-${a.color}">${icon(a.icon)}</span>`).join('')}</div>
  <form class="auth-card" method="post" action="/${mode}">
    <h1>${getting ? `Get ${e(getting.name)}` : isLogin ? 'Welcome back' : 'Create your account'}</h1>
    <p class="muted">${getting ? 'Sign in once and it’s yours.' : isLogin ? 'Log in to manage your balance and blocks.' : 'Add AI blocks to your Shortcuts and pay only for what you use.'}</p>
    ${error ? `<p class="alert" role="alert">${e(error)}</p>` : ''}${social}
    <input type="hidden" name="next" value="${e(next)}">
    <label>Email<input name="email" type="email" autocomplete="email" required value="${e(email)}"></label>
    <label>Password<input name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" minlength="10" required></label>
    <button class="btn btn-lg btn-block" type="submit">${isLogin ? 'Log in' : 'Create account'}</button>
    ${isLogin ? '' : `<p class="small muted center">By creating an account you agree to our <a href="${appMode ? '/app' : ''}/terms">Terms</a> and <a href="${appMode ? '/app' : ''}/privacy">Privacy Policy</a>.</p>`}
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
    </li>`).join('') : '<li class="muted small empty">Nothing added yet. <a href="/automations">Browse blocks</a> and tap Get.</li>';
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
  <div class="panel wide"><h2>Privacy and account</h2>
    <a href="/account/ai-privacy">AI data-sharing permission</a> · <a href="/account/delete">Delete account</a>
  </div>
</section>`,
  });
}


export const notFound = ({ user }) => layout({
  title: 'Not found', user,
  body: '<section class="wrap page-head center"><h1>Nothing here</h1><p class="lede">That page does not exist. <a href="/automations">Browse blocks</a>.</p></section>',
});
