// Compiles shortcuts/*.cherri into signed, installable files at public/shortcuts/<slug>.shortcut.
//
// Needs the Cherri compiler (https://github.com/electrikmilk/cherri) built with the import
// question fix in scripts/cherri-import-questions.patch and the Log Health Sample quantity
// support in scripts/cherri-health-quantity.patch, on PATH or at CHERRI=/path/to/cherri.
// Usage: npm run shortcuts [-- slug ...]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUTOMATIONS } from '../src/catalog.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHERRI = process.env.CHERRI || 'cherri';
const API_BASE = (process.env.SHORTCUT_API_BASE || 'https://iphoneadvanced.com').replace(/\/$/, '');
export const KEY_QUESTION = 'Paste your Advanced Automations key. We copied it for you when you tapped Add to Shortcuts.';

const INCLUDES = ['calendar', 'crypto', 'documents', 'images', 'media', 'network', 'photos', 'sharing', 'text', 'web']
  .map((c) => `#include 'actions/${c}'`).join('\n');

// Every shortcut sends its input to /api/v1/run/<slug>. The server owns the prompt and model,
// so they can change without anyone reinstalling. Errors come back with a message and a link
// (top up, get a new key) that the shortcut offers to open.
// A shortcut with `const audio` posts the recording itself; the rest post JSON, adding "choice"
// and "image" when they define those.
const request = (url, { choice, image, audio }) => (audio
  ? `fileRequest("${url}", "POST", audio, {"Authorization": "Bearer {apiKey}"})`
  : `jsonRequest("${url}", "POST", {"input": "{input}"${choice ? ', "choice": "{choice}"' : ''}${image ? ', "image": "{image}"' : ''}}, {"Authorization": "Bearer {apiKey}"})`);
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
    choice: /\bconst choice\b/.test(body),
    image: /\bconst image\b/.test(body),
    audio: /\bconst audio\b/.test(body),
  }))}`;
}

// Checks that the import question points at the Trim Whitespace action that holds the key.
// Stock Cherri gets ActionIndex wrong (see scripts/cherri-import-questions.patch).
function checkImportQuestion(xml) {
  const ids = [...xml.matchAll(/<key>WFWorkflowActionIdentifier<\/key>\s*<string>([^<]+)<\/string>/g)].map((m) => m[1]);
  const index = Number(xml.match(/<key>WFWorkflowImportQuestions<\/key>\s*<array>\s*<dict>\s*<key>ActionIndex<\/key>\s*<integer>(\d+)<\/integer>/)?.[1]);
  if (ids[index] !== 'is.workflow.actions.text.trimwhitespace') {
    throw new Error(`Import question points at action ${index} (${ids[index]}). Build Cherri with scripts/cherri-import-questions.patch.`);
  }
}

// Cherri compiles and signs. Off macOS it signs through RoutineHub's HubSign service.
function build(a, outDir) {
  const work = mkdtempSync(join(tmpdir(), 'shortcut-'));
  try {
    const src = join(work, `${a.slug}.cherri`);
    writeFileSync(src, cherriSource(a));
    execFileSync(CHERRI, [src, '--debug', '--derive-uuids', '--share=anyone', `--output=${join(work, `${a.slug}.shortcut`)}`], { cwd: work, stdio: ['ignore', 'pipe', 'pipe'] });
    checkImportQuestion(readFileSync(join(work, `${a.name}.plist`), 'utf8'));
    const signed = readFileSync(join(work, `${a.slug}.shortcut`));
    if (signed.subarray(0, 4).toString() !== 'AEA1') throw new Error('Output is not a signed shortcut');
    writeFileSync(join(outDir, `${a.slug}.shortcut`), signed);
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
