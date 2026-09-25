// Generates UI mockups and site imagery with GPT-Image-2.
// Usage: OPENAI_API_KEY=... npm run mockups [-- name ...]
// Output: docs/mockups/*.png (design references) and public/img/hero.png (used by the landing page).
// Review any image with people for malformed hands before shipping it.
import fs from 'node:fs/promises';
import path from 'node:path';

const STYLE = 'Minimalist, modern web UI. Off-white background (#fbfbfa), near-black text, one orange accent (#ff5a1f), generous whitespace, SF Pro style sans-serif, soft 18px rounded cards with hairline borders, no gradients except on small app tiles. Crisp, realistic product-design mockup, not a photo of a screen.';

const JOBS = {
  landing: {
    out: 'docs/mockups/landing.png', size: '1024x1536',
    prompt: `Desktop landing page for "Advanced Automations", a site offering free iPhone Shortcuts automations with pay-as-you-go AI. Sticky top nav with logo, Automations, Pricing, Log in, and a black pill "Get started" button. Hero: headline "Your iPhone, quietly smarter." with a subtitle and two buttons, and on the right an iPhone showing colorful Shortcuts tiles and a result card. Below: three numbered steps, then a grid of six automation cards. ${STYLE}`,
  },
  catalog: {
    out: 'docs/mockups/catalog.png', size: '1024x1536',
    prompt: `Automations catalog page for "Advanced Automations". Title "Automations", category pill tabs (All, Writing, Productivity, Capture, Everyday), and a three-column grid of cards. Each card has a small category chip, a per-run price like "≈ $0.004 / run", a bold name such as "Summarize Anything" or "Reply Drafter", a one-line description, and the trigger (Share Sheet, Back Tap). ${STYLE}`,
  },
  account: {
    out: 'docs/mockups/account.png', size: '1536x1024',
    prompt: `Account dashboard for "Advanced Automations". Left card: large balance "$12.48" with four top-up buttons $5 $10 $25 $50 and "Secure checkout by Stripe". Right card: API keys list with Revoke buttons and a "Create key" field. Bottom full-width card: activity table with dates, descriptions like "Sonnet 5: 412 in / 96 out" and amounts. ${STYLE}`,
  },
  hero: {
    out: 'public/img/hero.png', size: '1024x1536', background: 'transparent',
    prompt: 'A single modern iPhone floating at a slight angle on a transparent background, screen showing an iOS Shortcuts grid of rounded tiles in orange, violet, green and blue, with a white notification-style card reading "Summarize Anything". Soft studio lighting, subtle shadow, no hands, no people, no text outside the screen. Minimal, premium product render.',
  },
};

const key = process.env.OPENAI_API_KEY;
if (!key) {
  console.error('Set OPENAI_API_KEY to generate mockups.');
  process.exit(1);
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(JOBS);
for (const name of names) {
  const job = JOBS[name];
  if (!job) { console.error(`Unknown job "${name}". Options: ${Object.keys(JOBS).join(', ')}`); continue; }
  process.stdout.write(`Generating ${name}... `);
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-image-2',
      prompt: job.prompt,
      size: job.size,
      quality: 'high',
      ...(job.background && { background: job.background }),
      n: 1,
    }),
  });
  const body = await res.json();
  if (!res.ok) { console.error(`failed: ${body.error?.message || res.status}`); continue; }
  await fs.mkdir(path.dirname(job.out), { recursive: true });
  await fs.writeFile(job.out, Buffer.from(body.data[0].b64_json, 'base64'));
  console.log(`saved ${job.out}`);
}
