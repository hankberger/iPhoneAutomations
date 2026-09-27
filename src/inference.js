import { MICROS, formatUsd } from './billing.js';

// Cloudflare Workers AI text models we resell, with Cloudflare's USD price per million tokens.
// Check these against developers.cloudflare.com/workers-ai/platform/pricing before launch.
export const MODELS = {
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { label: 'Llama 3.3 70B', input: 0.293, output: 2.253 },
  '@cf/mistralai/mistral-small-3.1-24b-instruct': { label: 'Mistral Small 3.1', input: 0.351, output: 0.555, vision: true },
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast': { label: 'Llama 3.1 8B', input: 0.045, output: 0.384 },
};
export const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const DEFAULT_MAX_TOKENS = 1024;
const MAX_TOKENS_CAP = 4096;
const MAX_BODY_CHARS = 200_000;
// Photos are sent inline as data URLs. They are billed by the model's image tokens, not their
// base64 length, so they are left out of the size check and reserved at a fixed worst case.
// Mistral Small 3.1 caps an image at about 3,000 tokens.
const IMAGE_TOKENS = 4096;
const DATA_URL = /^data:image\/(jpeg|png|webp|gif);base64,/;

// With nodejs_compat, Workers exposes [vars] on process.env.
export const markup = () => Number(globalThis.process?.env?.MARKUP || 1.5);

// Micro-dollars charged to the user: tokens x $/M x markup, and 1 micro-dollar = $1/M.
export function costMicros(model, inputTokens, outputTokens) {
  const p = MODELS[model] ?? MODELS[DEFAULT_MODEL];
  return Math.ceil((inputTokens * p.input + outputTokens * p.output) * markup());
}

export const retailPrice = (model) => ({
  input: MODELS[model].input * markup(),
  output: MODELS[model].output * markup(),
});

// Accepts a data URL or bare base64 (what Shortcuts' Base64 Encode makes; it may wrap lines).
function imageUrl(value) {
  if (typeof value !== 'string') return '';
  const v = value.replace(/\s+/g, '');
  if (DATA_URL.test(v)) return v;
  if (v.startsWith('/9j/')) return `data:image/jpeg;base64,${v}`;
  if (v.startsWith('iVBOR')) return `data:image/png;base64,${v}`;
  return '';
}

// The first {...} in a model's answer, parsed, or null. Models sometimes wrap JSON in prose.
function jsonObject(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    const value = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

const FORMATS = {
  // Keys that are false or empty are dropped, so a shortcut can test them with a plain If.
  json: (text) => {
    const value = jsonObject(text);
    return value && JSON.stringify(Object.fromEntries(Object.entries(value).filter(([, v]) => v !== false && v !== '' && v != null)));
  },
  vcard: (text) => text.match(/BEGIN:VCARD[\s\S]*?END:VCARD/i)?.[0].replace(/\r?\n/g, '\r\n') ?? null,
};

// Cloudflare error codes that mean the caller should retry later rather than fix the request.
const RATE_LIMIT_CODES = new Set([3036, 3040]);

// Same run(model, input) shape as the Workers AI binding, over the REST API. Used by
// `npm run dev:local`, where the binding's remote proxy needs Workers edit permissions.
export function restAi(accountId, apiToken, fetchImpl = globalThis.fetch) {
  return {
    async run(model, input) {
      const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        const e = data.errors?.[0];
        throw new Error(e ? `${e.code}: ${e.message}` : `Workers AI returned ${res.status}`);
      }
      return data.result;
    },
  };
}

// `ai` is the Workers AI binding (env.AI). Calls bill to this Cloudflare account and
// no API token is involved.
export function createInference(billing, { ai } = {}) {
  const enabled = Boolean(ai);

  // Reserves the worst case, calls Workers AI, then charges actual usage and refunds the rest.
  async function meteredRun(user, model, payload) {
    if (!enabled) return { status: 503, json: { error: 'Inference is not configured on this server.' } };
    if (!MODELS[model]) return { status: 400, json: { error: `Unsupported model. Use one of: ${Object.keys(MODELS).join(', ')}` } };
    if (payload.stream) return { status: 400, json: { error: 'Streaming is not supported yet. Remove "stream": true.' } };

    const requested = Number(payload.max_tokens);
    const maxTokens = Math.min(Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_MAX_TOKENS, MAX_TOKENS_CAP);
    const input = { ...payload, max_tokens: maxTokens, stream: false };
    let images = 0;
    const size = JSON.stringify(input, (k, v) => (typeof v === 'string' && DATA_URL.test(v) ? (images++, '') : v)).length;
    if (size > MAX_BODY_CHARS) return { status: 413, json: { error: 'Request is too large.' } };

    // A token is never shorter than one character, so body length bounds the text tokens.
    const reserved = costMicros(model, size + images * IMAGE_TOKENS, maxTokens);
    if (!(await billing.reserve(user.id, reserved))) {
      return {
        status: 402,
        json: { error: `Not enough credit. This request can cost up to ${formatUsd(reserved, 4)}; top up at /account.`, balance_usd: (await billing.balance(user.id)) / MICROS },
      };
    }

    let result;
    try {
      result = (await ai.run(model, input)) ?? {};
    } catch (err) {
      await billing.settle(user.id, reserved, 0, {});
      const message = String(err?.message ?? err);
      const code = Number(message.match(/\b(\d{4})\b/)?.[1]);
      const status = RATE_LIMIT_CODES.has(code) ? 429 : code >= 5000 && code < 6000 ? 400 : 502;
      return { status, json: { error: 'Model provider rejected the request.', errors: [{ code: code || undefined, message }] } };
    }

    const text = typeof result.response === 'string' ? result.response : '';
    // Most Workers AI text models report usage; estimate at ~4 characters per token when one does not.
    const inputTokens = result.usage?.prompt_tokens ?? Math.ceil(size / 4);
    const outputTokens = result.usage?.completion_tokens ?? Math.ceil(JSON.stringify(result.response ?? '').length / 4);
    const actual = Math.min(costMicros(model, inputTokens, outputTokens), reserved);
    await billing.settle(user.id, reserved, actual, {
      description: `${MODELS[model].label}: ${inputTokens} in / ${outputTokens} out`,
      model, input_tokens: inputTokens, output_tokens: outputTokens,
    });

    return {
      status: 200,
      result,
      text,
      billing: { cost_usd: actual / MICROS, balance_usd: (await billing.balance(user.id)) / MICROS, usage: { input_tokens: inputTokens, output_tokens: outputTokens } },
    };
  }

  // Shortcuts-friendly: { prompt, input?, image?, system?, model?, max_tokens? } -> { text, ... }
  // `image` is a base64 JPEG or PNG, or a data URL, for models that read photos.
  async function generate(user, body) {
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) return { status: 400, json: { error: 'Send a "prompt" string.' } };
    const model = body.model ?? DEFAULT_MODEL;
    const input = typeof body.input === 'string' ? body.input : '';
    const text = input ? `${prompt}\n\n<input>\n${input}\n</input>` : prompt;
    let content = text;
    if (body.image !== undefined) {
      if (!MODELS[model]?.vision) return { status: 400, json: { error: `${MODELS[model]?.label ?? 'This model'} can’t read images.` } };
      const image = imageUrl(body.image);
      if (!image) return { status: 400, json: { error: 'Send "image" as a base64 JPEG or PNG.' } };
      content = [{ type: 'text', text }, { type: 'image_url', image_url: { url: image } }];
    }
    const messages = [
      ...(typeof body.system === 'string' ? [{ role: 'system', content: body.system }] : []),
      { role: 'user', content },
    ];
    const out = await meteredRun(user, model, { messages, max_tokens: body.max_tokens });
    if (out.status !== 200) return out;
    return { status: 200, json: { text: out.text, model, ...out.billing } };
  }

  // What the installed shortcuts call: the automation supplies the prompt and model, the
  // shortcut only sends { input, choice?, image? }. A choice outside the automation's list falls
  // back to its first option, so nothing but the listed words reaches the prompt.
  async function runAutomation(user, automation, body) {
    if (!automation.prompt) return { status: 400, json: { error: `${automation.name} runs entirely on your iPhone and doesn’t use AI.` } };
    const input = typeof body.input === 'string' ? body.input.trim() : '';
    const image = automation.image ? body.image : undefined;
    if (automation.image && !image) return { status: 400, json: { error: 'There was no photo to look at. Take or share a photo, then run the shortcut again.' } };
    if (!input && !image) return { status: 400, json: { error: 'There was nothing to work with. Share some text, or copy it first, then run the shortcut again.' } };
    const choice = automation.choices ? (automation.choices.includes(body.choice) ? body.choice : automation.choices[0]) : '';
    const prompt = automation.prompt.replace('{{choice}}', choice);
    const out = await generate(user, { prompt, input, image, model: automation.model });
    if (out.status !== 200 || !automation.format) return out;
    // The shortcut feeds the answer straight into Get Dictionary or a .vcf file, so hand back
    // exactly that, or a readable error. The run is still charged: the model did the work.
    const clean = FORMATS[automation.format](out.json.text);
    if (!clean) return { status: 422, json: { ...out.json, error: automation.formatError } };
    return { status: 200, json: { ...out.json, text: clean } };
  }

  // Pass-through that mirrors Cloudflare's /ai/run/{model} REST request and response shape.
  async function run(user, model, body) {
    const out = await meteredRun(user, model, body ?? {});
    if (out.status !== 200) return { status: out.status, json: { success: false, ...out.json } };
    return { status: 200, json: { success: true, result: out.result, billing: out.billing } };
  }

  return { enabled, generate, run, runAutomation };
}
