// Builds three static landing-page design directions for review.
import fs from 'node:fs';

const items = [
  { name: 'Summarize Anything', desc: 'Share any article or email, get three clean lines back.', trig: 'Share Sheet', cost: '0.4¢', icon: 'doc', color: '#ff6b3d' },
  { name: 'Reply Drafter', desc: 'Copy a message, tap twice, paste a warm reply.', trig: 'Back Tap', cost: '0.6¢', icon: 'chat', color: '#7c5cff' },
  { name: 'Voice to Notes', desc: 'Ramble for a minute. Get a tidy note with a checklist.', trig: 'Action Button', cost: '0.8¢', icon: 'mic', color: '#10b981' },
  { name: 'Smart Reminders', desc: 'Turn a messy list into real reminders with dates.', trig: 'Share Sheet', cost: '0.6¢', icon: 'bell', color: '#f5b400' },
  { name: 'Receipt Reader', desc: 'Snap a receipt, log merchant and total to a sheet.', trig: 'Home Screen', cost: '0.2¢', icon: 'receipt', color: '#ec4899' },
  { name: 'Translate Selection', desc: 'Natural translation that keeps names and tone.', trig: 'Share Sheet', cost: '0.2¢', icon: 'globe', color: '#0ea5e9' },
  { name: 'Morning Brief', desc: 'A calm plan for your day from calendar and reminders.', trig: 'Every day, 7:00', cost: '2¢', icon: 'sun', color: '#f97316' },
  { name: 'Tone Shifter', desc: 'Rewrite anything friendlier, firmer or shorter.', trig: 'Share Sheet', cost: '0.3¢', icon: 'wand', color: '#6366f1' },
];

const P = {
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  wand: '<path d="M4 20 15 9M14 4v3M19 9h-3M17.5 5.5 16 7"/>',
};
const icon = (k, sw = 1.7) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${P[k]}</svg>`;
const page = (title, fonts, css, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
${fonts.map((f) => `<link rel="stylesheet" href="node_modules/${f}">`).join('\n')}
<style>*{box-sizing:border-box}body{margin:0}a{color:inherit;text-decoration:none}${css}</style></head><body>${body}</body></html>`;

// A: Editorial
fs.writeFileSync('a-editorial.html', page('A · Editorial', ['@fontsource/instrument-serif/index.css', '@fontsource/instrument-serif/400-italic.css', '@fontsource-variable/inter/index.css', '@fontsource-variable/jetbrains-mono/index.css'], `
body{background:#f3efe6;color:#1b1a17;font:16px/1.55 'Inter Variable',sans-serif}
.w{max-width:1240px;margin:0 auto;padding:0 32px}
nav{display:flex;justify-content:space-between;align-items:center;height:76px;border-bottom:1px solid #1b1a1726;font-size:14px}
.logo{font-family:'Instrument Serif';font-size:26px;letter-spacing:-.01em}
nav .links{display:flex;gap:28px;align-items:center}
.pill{border:1px solid #1b1a17;border-radius:999px;padding:9px 18px}
.dark{background:#1b1a17;color:#f3efe6}
.hero{display:grid;grid-template-columns:1.35fr 1fr;gap:64px;padding:96px 0 88px;align-items:end;border-bottom:1px solid #1b1a1726}
.kick{font:500 12px 'JetBrains Mono Variable';letter-spacing:.08em;text-transform:uppercase;color:#b3401a;margin-bottom:28px}
h1{font:400 108px/0.92 'Instrument Serif';letter-spacing:-.025em;margin:0}
h1 em{color:#b3401a}
.lede{font-size:19px;color:#55524a;max-width:30em;margin:28px 0 36px}
.cta{display:flex;gap:12px}.cta a{padding:15px 26px;font-size:15px;font-weight:550}
.run{background:#fffdf8;border:1px solid #1b1a1726;border-radius:4px;padding:28px;font:13px/1.7 'JetBrains Mono Variable';box-shadow:0 30px 60px -40px #1b1a1760}
.run .h{display:flex;justify-content:space-between;color:#8a857a;border-bottom:1px dashed #1b1a1740;padding-bottom:14px;margin-bottom:16px}
.run .in{color:#8a857a}.run .out{font:22px/1.35 'Instrument Serif';color:#1b1a17;margin:14px 0 18px}
.run .f{display:flex;justify-content:space-between;border-top:1px dashed #1b1a1740;padding-top:14px;color:#8a857a}
.sec{display:flex;justify-content:space-between;align-items:baseline;padding:72px 0 24px}
h2{font:400 56px/1 'Instrument Serif';margin:0;letter-spacing:-.02em}
.sec span{font:12px 'JetBrains Mono Variable';text-transform:uppercase;letter-spacing:.08em;color:#8a857a}
.row{display:grid;grid-template-columns:70px 1.1fr 1.6fr 180px 80px 30px;gap:24px;align-items:center;padding:26px 0;border-top:1px solid #1b1a1726;transition:.2s}
.row:last-child{border-bottom:1px solid #1b1a1726}
.row .n{font:13px 'JetBrains Mono Variable';color:#8a857a}
.row .t{font:400 32px/1 'Instrument Serif';letter-spacing:-.01em}
.row .d{color:#55524a}.row .g,.row .c{font:13px 'JetBrains Mono Variable';color:#55524a}.row .c{text-align:right;color:#1b1a17}
.row:hover{background:#ebe6da}
.foot{display:grid;grid-template-columns:repeat(3,1fr);gap:48px;padding:88px 0}
.foot b{font:400 64px/1 'Instrument Serif';display:block;margin-bottom:12px}
.foot p{color:#55524a;margin:0}
@media(max-width:800px){h1{font-size:60px}.hero{grid-template-columns:1fr;padding:56px 0}.row{grid-template-columns:40px 1fr 60px;gap:12px}.row .d,.row .g,.row .x{display:none}.row .t{font-size:26px}.foot{grid-template-columns:1fr;gap:32px}nav .links a:not(.pill){display:none}h2{font-size:40px}.w{padding:0 20px}}
`, `
<div class="w">
<nav><div class="logo">Advanced Automations</div><div class="links"><a>Automations</a><a>Pricing</a><a>Log in</a><a class="pill dark">Get started</a></div></nav>
<section class="hero">
  <div><div class="kick">Free Shortcuts · Pay per run</div>
  <h1>Small automations for a <em>calmer</em> phone.</h1>
  <p class="lede">A library of iPhone Shortcuts that quietly do the tedious parts. The automations are free. The AI inside them costs about half a cent a run.</p>
  <div class="cta"><a class="pill dark">Create a free account</a><a class="pill">Browse the library</a></div></div>
  <div class="run"><div class="h"><span>Summarize Anything</span><span>09:41</span></div>
  <div class="in">in → "Hi all, quick update on the Q3 launch. After talking with design and legal we're moving..." (412 words)</div>
  <div class="out">Launch moves to Oct 14. Design review Thursday. Budget unchanged.</div>
  <div class="f"><span>Sonnet 5 · 1.2s</span><span>$0.004</span></div></div>
</section>
<div class="sec"><h2>The library</h2><span>${items.length} automations · all free</span></div>
<div>${items.map((a, i) => `<div class="row"><span class="n">№ ${String(i + 1).padStart(2, '0')}</span><span class="t">${a.name}</span><span class="d">${a.desc}</span><span class="g">${a.trig}</span><span class="c">${a.cost}</span><span class="x">→</span></div>`).join('')}</div>
<div class="foot"><div><b>$0</b><p>for every automation, forever. Copy the steps and they're yours.</p></div><div><b>½¢</b><p>typical cost of a run, billed from credit you top up when you like.</p></div><div><b>2 min</b><p>to set one up. Each lists the exact Shortcuts actions to add.</p></div></div>
</div>`));

// B: Dark product
fs.writeFileSync('b-dark.html', page('B · Dark', ['@fontsource-variable/geist/index.css', '@fontsource-variable/jetbrains-mono/index.css'], `
body{background:#08080a;color:#ededf0;font:16px/1.55 'Geist Variable',sans-serif;overflow-x:hidden}
.w{max-width:1180px;margin:0 auto;padding:0 28px}
nav{display:flex;justify-content:space-between;align-items:center;height:68px;font-size:14px;color:#a1a1aa}
.logo{display:flex;gap:10px;align-items:center;color:#fff;font-weight:600;letter-spacing:-.01em}
.mark{width:26px;height:26px;border-radius:8px;background:#c8f542;display:grid;place-items:center;color:#08080a}.mark svg{width:16px}
nav .links{display:flex;gap:28px;align-items:center}
.btn{background:#fff;color:#08080a;border-radius:10px;padding:9px 16px;font-weight:550}
.ghost{border:1px solid #27272a;border-radius:10px;padding:9px 16px;color:#ededf0}
.hero{text-align:center;padding:110px 0 40px;position:relative}
.glow{position:absolute;inset:-120px 0 auto;height:620px;background:radial-gradient(50% 50% at 50% 30%,#c8f54222,transparent 70%);pointer-events:none}
.badge{display:inline-flex;gap:8px;align-items:center;border:1px solid #27272a;border-radius:999px;padding:6px 14px 6px 8px;font-size:13px;color:#a1a1aa;background:#111113}
.badge i{background:#c8f542;color:#08080a;border-radius:999px;padding:1px 8px;font-style:normal;font-weight:600;font-size:12px}
h1{font-size:88px;line-height:.98;letter-spacing:-.045em;font-weight:620;margin:28px auto 0;max-width:900px;background:linear-gradient(180deg,#fff 30%,#8b8b95);-webkit-background-clip:text;color:transparent}
.lede{color:#a1a1aa;font-size:19px;max-width:560px;margin:24px auto 36px}
.cta{display:flex;gap:12px;justify-content:center}.cta a{padding:13px 22px;font-size:15px}
.stage{margin:72px auto 0;max-width:980px;border:1px solid #1f1f23;border-radius:22px;background:linear-gradient(#111114,#0b0b0d);padding:28px;display:grid;grid-template-columns:1fr 1fr;gap:28px;text-align:left;box-shadow:0 60px 120px -60px #c8f54233}
.term{font:13px/1.8 'JetBrains Mono Variable';color:#a1a1aa}
.term .k{color:#c8f542}.term .s{color:#ededf0}
.term .l{display:flex;gap:10px}
.notif{align-self:center;background:#1c1c20cc;border:1px solid #2a2a30;border-radius:20px;padding:18px;backdrop-filter:blur(20px)}
.notif .t{display:flex;gap:10px;align-items:center;font-size:13px;color:#a1a1aa;margin-bottom:8px}
.notif .t span{width:22px;height:22px;border-radius:6px;background:#ff6b3d;display:grid;place-items:center;color:#fff}.notif .t svg{width:13px}
.notif p{margin:0;font-size:15px;color:#fff}
.sec{padding:120px 0 28px;display:flex;justify-content:space-between;align-items:end}
h2{font-size:40px;letter-spacing:-.035em;font-weight:600;margin:0}
.sec p{color:#71717a;margin:0}
.bento{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.card{border:1px solid #1f1f23;background:#0e0e10;border-radius:18px;padding:22px;min-height:190px;display:flex;flex-direction:column;transition:.2s}
.card:hover{border-color:#3f3f46;background:#131316}
.card .ic{width:36px;height:36px;border-radius:10px;border:1px solid #27272a;display:grid;place-items:center;color:#c8f542;margin-bottom:20px}.card .ic svg{width:18px}
.card h3{font-size:16px;font-weight:600;margin:0 0 6px;letter-spacing:-.01em}.card p{color:#8b8b95;font-size:14px;margin:0}
.card .m{margin-top:auto;padding-top:18px;display:flex;justify-content:space-between;font:12px 'JetBrains Mono Variable';color:#71717a}
.card.big{grid-column:span 2}
.price{margin:120px 0 80px;border:1px solid #1f1f23;border-radius:22px;display:grid;grid-template-columns:repeat(3,1fr)}
.price div{padding:36px;border-right:1px solid #1f1f23}.price div:last-child{border:0}
.price b{font:500 44px 'JetBrains Mono Variable';letter-spacing:-.04em;color:#fff;display:block}.price span{color:#71717a;font-size:14px}
@media(max-width:800px){h1{font-size:52px}.stage{grid-template-columns:1fr}.bento{grid-template-columns:1fr}.card.big{grid-column:auto}.price{grid-template-columns:1fr}.price div{border-right:0;border-bottom:1px solid #1f1f23}nav .links a:not(.btn){display:none}.hero{padding-top:64px}.sec{display:block}.w{padding:0 18px}}
`, `
<div class="w">
<nav><div class="logo"><span class="mark">${icon('wand', 2.2)}</span>Advanced Automations</div><div class="links"><a>Automations</a><a>Pricing</a><a>Docs</a><a>Log in</a><a class="btn">Get started</a></div></nav>
<section class="hero"><div class="glow"></div>
<span class="badge"><i>New</i> Morning Brief is live</span>
<h1>Shortcuts that think for you.</h1>
<p class="lede">Free iPhone automations powered by frontier AI. Pay only for what you run, from half a cent.</p>
<div class="cta"><a class="btn">Start free</a><a class="ghost">Browse automations</a></div>
<div class="stage">
  <div class="term"><div class="l"><span class="k">POST</span><span class="s">/api/v1/generate</span></div>
  <div>{ "prompt": <span class="s">"Summarize in 3 lines"</span>,</div><div>&nbsp;&nbsp;"input": <span class="s">"Hi all, quick update on…"</span> }</div><br>
  <div class="l"><span class="k">200</span><span>1.2s · sonnet-5 · 412→38 tokens</span></div><div class="l"><span class="k">cost</span><span class="s">$0.0041</span></div></div>
  <div class="notif"><div class="t"><span>${icon('doc', 2)}</span>Summarize Anything · now</div><p>Launch moves to Oct 14. Design review Thursday. Budget unchanged.</p></div>
</div>
</section>
<div class="sec"><div><h2>The automations</h2></div><p>All free. Build each in about two minutes.</p></div>
<div class="bento">${items.map((a, i) => `<div class="card${[0, 5, 6, 7].includes(i) ? ' big' : ''}"><div class="ic">${icon(a.icon)}</div><h3>${a.name}</h3><p>${a.desc}</p><div class="m"><span>${a.trig}</span><span>~${a.cost}</span></div></div>`).join('')}</div>
<div class="price"><div><b>$0</b><span>Every automation, forever</span></div><div><b>1.5×</b><span>List model price. No subscription.</span></div><div><b>$5</b><span>Minimum top-up. Credit never expires.</span></div></div>
</div>`));

// C: Playful tiles
fs.writeFileSync('c-tiles.html', page('C · Tiles', ['@fontsource-variable/bricolage-grotesque/index.css', '@fontsource-variable/inter/index.css'], `
body{background:#fff;color:#121212;font:16px/1.55 'Inter Variable',sans-serif}
.w{max-width:1200px;margin:0 auto;padding:0 28px}
nav{display:flex;justify-content:space-between;align-items:center;height:80px;font-size:15px;font-weight:500}
.logo{font:700 20px 'Bricolage Grotesque Variable';letter-spacing:-.02em;display:flex;gap:10px;align-items:center}
.logo i{width:30px;height:30px;border-radius:9px;background:conic-gradient(from 200deg,#ff6b3d,#f5b400,#10b981,#0ea5e9,#7c5cff,#ec4899,#ff6b3d)}
nav .links{display:flex;gap:26px;align-items:center}
.btn{background:#121212;color:#fff;border-radius:14px;padding:12px 20px;font-weight:600}
.hero{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center;padding:56px 0 40px}
h1{font:700 84px/.95 'Bricolage Grotesque Variable';letter-spacing:-.045em;margin:0}
h1 span{background:#fff1c2;border-radius:14px;padding:0 10px}
.lede{font-size:19px;color:#555;margin:24px 0 32px;max-width:28em}
.cta{display:flex;gap:12px;align-items:center}.cta .btn{padding:16px 26px;font-size:16px}.cta small{color:#777}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.tile{aspect-ratio:1;border-radius:28px;padding:18px;color:#fff;display:flex;flex-direction:column;justify-content:space-between;font:600 17px/1.15 'Bricolage Grotesque Variable';letter-spacing:-.01em;box-shadow:inset 0 -40px 60px -30px #0002;transition:transform .2s}
.tile:nth-child(2){transform:rotate(3deg)}.tile:nth-child(4){transform:rotate(-3deg)}.tile:nth-child(9){transform:rotate(2deg)}
.tile svg{width:30px;height:30px}
.tile.w2{grid-column:span 2;aspect-ratio:auto;background:#121212 !important;font:500 15px/1.4 'Inter Variable'}
.tile.w2 b{font:600 19px 'Bricolage Grotesque Variable';display:block;margin-bottom:6px}
.sec{padding:110px 0 28px;text-align:center}
h2{font:700 52px/1 'Bricolage Grotesque Variable';letter-spacing:-.04em;margin:0 0 10px}
.sec p{color:#666;margin:0}
.chips{display:flex;gap:8px;justify-content:center;margin-top:24px}.chips span{padding:8px 16px;border-radius:999px;background:#f3f3f1;font-weight:500;font-size:14px}.chips span:first-child{background:#121212;color:#fff}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-top:36px}
.card{border-radius:26px;padding:22px;background:var(--bg);min-height:230px;display:flex;flex-direction:column}
.card .ic{width:48px;height:48px;border-radius:15px;background:var(--c);color:#fff;display:grid;place-items:center;margin-bottom:18px}.card .ic svg{width:24px}
.card h3{font:650 21px/1.1 'Bricolage Grotesque Variable';letter-spacing:-.02em;margin:0 0 8px}.card p{margin:0;color:#444;font-size:14.5px}
.card .m{margin-top:auto;padding-top:16px;display:flex;justify-content:space-between;font-size:13px;font-weight:600;color:#555}
.how{margin:110px 0 80px;background:#121212;color:#fff;border-radius:36px;padding:56px;display:grid;grid-template-columns:repeat(3,1fr);gap:40px}
.how b{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:#fff;color:#121212;font:700 20px 'Bricolage Grotesque Variable';margin-bottom:18px}
.how h3{font:650 24px 'Bricolage Grotesque Variable';margin:0 0 8px;letter-spacing:-.02em}.how p{color:#aaa;margin:0}
@media(max-width:800px){h1{font-size:54px}.hero{grid-template-columns:1fr}.grid{grid-template-columns:1fr 1fr}.how{grid-template-columns:1fr;padding:32px}nav .links a:not(.btn){display:none}h2{font-size:38px}.w{padding:0 18px}.chips{flex-wrap:wrap}}
`, `
<div class="w">
<nav><div class="logo"><i></i>Advanced Automations</div><div class="links"><a>Automations</a><a>Pricing</a><a>Log in</a><a class="btn">Get started</a></div></nav>
<section class="hero">
  <div><h1>Make your iPhone do the <span>boring bits.</span></h1>
  <p class="lede">Free, ready-made Shortcuts with a little AI inside. Top up a few dollars and each run costs about half a cent.</p>
  <div class="cta"><a class="btn">Get started, it's free</a><small>No subscription</small></div></div>
  <div class="tiles">${items.slice(0, 6).map((a) => `<div class="tile" style="background:${a.color}">${icon(a.icon, 2)}<span>${a.name}</span></div>`).join('')}
  <div class="tile w2"><div><b>Summarize Anything</b>Launch moves to Oct 14. Design review Thursday. Budget unchanged.</div><span style="opacity:.6;font-size:13px">Sonnet 5 · $0.004</span></div>
  <div class="tile" style="background:${items[6].color}">${icon('sun', 2)}<span>Morning Brief</span></div></div>
</section>
<div class="sec"><h2>Pick one. Build it in two minutes.</h2><p>Every automation lists the exact Shortcuts actions to add.</p>
<div class="chips"><span>All</span><span>Writing</span><span>Productivity</span><span>Capture</span><span>Everyday</span></div></div>
<div class="grid">${items.map((a) => `<div class="card" style="--c:${a.color};--bg:${a.color}14"><div class="ic">${icon(a.icon, 2)}</div><h3>${a.name}</h3><p>${a.desc}</p><div class="m"><span>${a.trig}</span><span>~${a.cost}</span></div></div>`).join('')}</div>
<div class="how"><div><b>1</b><h3>Pick an automation</h3><p>Browse the library and open the steps.</p></div><div><b>2</b><h3>Paste your key</h3><p>One API key from your account, pasted once.</p></div><div><b>3</b><h3>Run it anywhere</h3><p>Share Sheet, Back Tap, Action Button or Siri.</p></div></div>
</div>`));
console.log('built');
