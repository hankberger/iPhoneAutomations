// Compiles shortcuts/*.cherri into signed, installable files at public/shortcuts/<slug>.shortcut.
//
// Needs Cherri with Health quantity support and unique control-flow grouping UUIDs.
// Tested: upstream a66db15b7f247f3121726c2a2b72becfeef3d96b (import fix included),
// plus scripts/cherri-health-quantity.patch and scripts/cherri-grouping-uuids.patch.
// Put it on PATH or set CHERRI=/path/to/cherri.
// Usage: npm run shortcuts [-- slug ...]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTOMATIONS } from '../src/catalog.js';
import { createHash } from 'node:crypto';
import { verifyMealWorkflow } from './shortcut-validation.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHERRI = process.env.CHERRI || 'cherri';
const API_BASE = (process.env.SHORTCUT_API_BASE || 'https://iphoneadvanced.com').replace(/\/$/, '');
export const KEY_PROMPT = 'Paste your Advanced Automations key. We copied it when you tapped Get. Lost it? Make one in your account at iphoneadvanced.com.';
// Every shortcut keeps the key in one file in the Shortcuts folder, so it is asked for once.
export const KEY_FILE = 'advanced-automations-key.txt';

const INCLUDES = ['calendar', 'crypto', 'documents', 'images', 'media', 'network', 'photos', 'sharing', 'text', 'web']
  .map((c) => `#include 'actions/${c}'`).join('\n');

// Every shortcut sends its input to /api/v1/run/<slug>. The server owns the prompt and model,
// so they can change without anyone reinstalling. Errors come back with a message and a link
// (top up, get a new key) that the shortcut offers to open.
// A shortcut with an `audio` variable posts the recording itself; the rest post JSON, adding
// "choice", "image" and "instructions" when they define those (as `const x` or `@x`).
const request = (url, { choice, image, audio, instructions, recipeVersion }) => (audio
  ? `fileRequest("${url}", "POST", ${audio}, {"Authorization": "Bearer {apiKey}"})`
  : `jsonRequest("${url}", "POST", {"input": "{input}"${choice ? ', "choice": "{choice}"' : ''}${image ? ', "image": "{image}"' : ''}${instructions ? ', "instructions": "{instructions}"' : ''}${recipeVersion ? `, "recipe_version": ${recipeVersion}` : ''}}, {"Authorization": "Bearer {apiKey}"})`);
// iOS's import-question screen leaves Add Shortcut dead, so the key is asked for on the first
// run instead and saved. A key the server rejects is overwritten so the next run asks again.
const keyBlock = `
const savedKey = getFile("${KEY_FILE}", nil, false)
@storedKey = "{savedKey}"
if @storedKey !contains "aa_live_" {
    const pasted = getClipboard()
    @clip = "{pasted}"
    @suggested = ""
    if @clip contains "aa_live_" {
        @suggested = trimWhitespace(@clip)
    }
    const entered = prompt("${KEY_PROMPT}", "Text", "{@suggested}")
    @storedKey = "{entered}"
    saveFile("${KEY_FILE}", @storedKey, true)
}
`;
const callBlock = (slug, sends) => `
const apiKey = trimWhitespace(@storedKey)
const response = ${request(`${API_BASE}/api/v1/run/${slug}`, sends)}
const reply = getDictionary(response)
const result = getValue(reply, "text")
if !result {
    const problem = getValue(reply, "error")
    const link = getValue(reply, "action_url")
    const badKey = getValue(reply, "key_invalid")
    if badKey {
        @cleared = "reset"
        saveFile("${KEY_FILE}", @cleared, true)
    }
    confirm("{problem}", "Advanced Automations")
    openURL("{link}")
    stop()
}`;

export function cherriSource(a) {
  const body = readFileSync(join(root, 'shortcuts', `${a.slug}.cherri`), 'utf8');
  if (!body.includes('// @call')) throw new Error(`${a.slug}.cherri has no "// @call" marker`);
  return `${INCLUDES}
#define name ${a.name}
${body.replace('// @call', keyBlock + callBlock(a.slug, {
    recipeVersion: a.recipeVersion,
    choice: /\bconst choice\b/.test(body),
    image: /(\bconst |@)image\b/.test(body),
    audio: body.match(/\bconst (audio)\b|(@audio)\b/)?.slice(1).find(Boolean),
    instructions: /@instructions\b/.test(body),
  }))}`;
}

// Checks the key comes from the saved file, not an import question: iOS's setup screen for
// those never lets Add Shortcut through.
function checkKeySetup(xml) {
  if (/<key>WFWorkflowImportQuestions<\/key>\s*<array>\s*<dict>/.test(xml)) {
    throw new Error('Shortcut has an import question. The key is asked for on first run instead.');
  }
  if (!xml.includes(`<string>${KEY_FILE}</string>`)) throw new Error(`Shortcut does not read ${KEY_FILE}`);
}

// macOS signs locally without silently uploading source to a third-party fallback.
// Off macOS, Cherri uses its configured signing service.
function build(a, outDir) {
  const work = mkdtempSync(join(tmpdir(), 'shortcut-'));
  try {
    const src = join(work, `${a.slug}.cherri`);
    writeFileSync(src, cherriSource(a));
    const localSign = process.platform === 'darwin';
    execFileSync(CHERRI, [src, '--debug', '--derive-uuids', '--share=anyone', ...(localSign ? ['--skip-sign'] : []), `--output=${join(work, `${a.slug}.shortcut`)}`], { cwd: work, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000 });
    const xml = readFileSync(join(work, `${a.name}.plist`), 'utf8');
    checkKeySetup(xml);
    let mealWorkflow;
    if (a.slug === 'snap-calories') {
      mealWorkflow = JSON.parse(execFileSync('plutil', ['-convert', 'json', '-o', '-', join(work, `${a.name}.plist`)], { encoding: 'utf8' }));
      verifyMealWorkflow(mealWorkflow);
    }
    if (process.env.SHORTCUT_AUDIT_DIR) {
      mkdirSync(process.env.SHORTCUT_AUDIT_DIR, { recursive: true });
      writeFileSync(join(process.env.SHORTCUT_AUDIT_DIR, `${a.slug}.plist`), xml);
    }
    if (localSign) execFileSync('/usr/bin/shortcuts', ['sign', '-i', join(work, `${a.name}_unsigned.shortcut`), '-o', join(work, `${a.slug}.shortcut`), '-m', 'anyone'], { timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
    const signed = readFileSync(join(work, `${a.slug}.shortcut`));
    if (signed.subarray(0, 4).toString() !== 'AEA1') throw new Error('Output is not a signed shortcut');
    writeFileSync(join(outDir, `${a.slug}.shortcut`), signed);
    if (mealWorkflow) {
      const sha = value => createHash('sha256').update(value).digest('hex');
      const fixtures = join(root, 'test', 'fixtures');
      mkdirSync(fixtures, { recursive: true });
      writeFileSync(join(fixtures, 'meal-workflow.json'), JSON.stringify({
        sourceSHA256: sha(cherriSource(a)), signedSHA256: sha(signed), workflow: mealWorkflow,
      }, null, 2) + '\n');
    }
  } catch (err) {
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`.replace(/\x1b\[[0-9;]*m/g, '');
    throw new Error(`${a.slug}: ${err.message}\n${out}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.slice(2);
  const outDir = join(root, 'public', 'shortcuts');
  mkdirSync(outDir, { recursive: true });
  for (const a of AUTOMATIONS.filter((x) => !only.length || only.includes(x.slug))) {
    build(a, outDir);
    console.log(`signed ${a.slug}.shortcut`);
  }
}
