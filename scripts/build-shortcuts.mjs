// Compiles shortcuts/*.cherri into signed, installable files at public/shortcuts/<slug>.shortcut.
//
// Needs Cherri with correct import-question indexes and Health quantity support.
// Tested: upstream a66db15b7f247f3121726c2a2b72becfeef3d96b (import fix included),
// plus scripts/cherri-health-quantity.patch. Older versions need the import patch too.
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
export const KEY_QUESTION = 'Paste your Advanced Automations key. We copied it for you when you tapped Add to Shortcuts.';

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
const callBlock = (slug, sends) => `
const apiKey = trimWhitespace(key)
const response = ${request(`${API_BASE}/api/v1/run/${slug}`, sends)}
const reply = getDictionary(response)
const result = getValue(reply, "text")
if !result {
    const problem = getValue(reply, "error")
    const link = getValue(reply, "action_url")
    confirm("{problem}", "Advanced Automations")
    openURL("{link}")
    stop()
}`;

export function cherriSource(a) {
  const body = readFileSync(join(root, 'shortcuts', `${a.slug}.cherri`), 'utf8');
  if (!body.includes('// @call')) throw new Error(`${a.slug}.cherri has no "// @call" marker`);
  return `${INCLUDES}
#define name ${a.name}
#question key "${KEY_QUESTION}" ""
${body.replace('// @call', callBlock(a.slug, {
    recipeVersion: a.recipeVersion,
    choice: /\bconst choice\b/.test(body),
    image: /(\bconst |@)image\b/.test(body),
    audio: body.match(/\bconst (audio)\b|(@audio)\b/)?.slice(1).find(Boolean),
    instructions: /@instructions\b/.test(body),
  }))}`;
}

// Checks that the import question points at the Trim Whitespace action that holds the key.
// Older Cherri versions get ActionIndex wrong (see scripts/cherri-import-questions.patch).
function checkImportQuestion(xml) {
  const ids = [...xml.matchAll(/<key>WFWorkflowActionIdentifier<\/key>\s*<string>([^<]+)<\/string>/g)].map((m) => m[1]);
  const index = Number(xml.match(/<key>WFWorkflowImportQuestions<\/key>\s*<array>\s*<dict>\s*<key>ActionIndex<\/key>\s*<integer>(\d+)<\/integer>/)?.[1]);
  if (ids[index] !== 'is.workflow.actions.text.trimwhitespace') {
    throw new Error(`Import question points at action ${index} (${ids[index]}). Build Cherri with scripts/cherri-import-questions.patch.`);
  }
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
    checkImportQuestion(xml);
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
