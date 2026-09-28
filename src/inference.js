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

// Models sometimes write a heading with a lone "- None" under it instead of leaving it out.
const dropEmptySections = (text) => text.replace(/\n\n[^\n]+\n- None\.?[ \t]*(?=\n\n|$)/gi, '');

// Workers AI takes audio as base64. Built in chunks so long recordings don't overflow the stack.
function base64(bytes) {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 0x8000) binary += String.fromCharCode(...view.subarray(i, i + 0x8000));
  return btoa(binary);
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
};

// Speech to text, billed per minute of audio at Cloudflare's price times the markup.
export const AUDIO_MODELS = {
  '@cf/openai/whisper-large-v3-turbo': { label: 'Whisper Large v3 Turbo', perMinute: 0.00051 },
};
const AUDIO_MODEL = '@cf/openai/whisper-large-v3-turbo';
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
// iPhone recordings run far above 50 KB a minute (about 7 kbps), so this bounds the minutes we reserve for.
const MIN_AUDIO_BYTES_PER_MINUTE = 50_000;
export const audioMicros = (minutes) => Math.ceil(minutes * AUDIO_MODELS[AUDIO_MODEL].perMinute * markup() * MICROS);

// Text to image through OpenAI, billed by the tokens OpenAI reports (USD per million: prompt text
// in, image out) times the markup. Low quality at 1024x1024 comes out near 200 image tokens.
export const IMAGE_MODELS = {
  'gpt-image-2': { label: 'GPT Image 2', textInput: 5.0, imageOutput: 30.0, size: '1024x1024', quality: 'low', typicalTokens: [20, 200], maxOutputTokens: 800 },
};
const MAX_IMAGE_PROMPT = 2048;
export const imageMicros = (model, inputTokens, outputTokens) => {
  const m = IMAGE_MODELS[model];
  return Math.ceil((inputTokens * m.textInput + outputTokens * m.imageOutput) * markup());
};

// OpenAI image generation through Cloudflare AI Gateway. In the Worker it goes through the AI
// binding's gateway (Cloudflare authenticates it); locally, over HTTPS with a Cloudflare API token.
// Unified Billing doesn't cover image generation, so it needs an OpenAI key stored in the gateway
// (bring your own key), or OPENAI_API_KEY here.
export function aiGateway({ binding, accountId, apiToken, gatewayId = 'default', openaiKey, fetchImpl = globalThis.fetch } = {}) {
  async function call(endpoint, body) {
    const headers = { 'Content-Type': 'application/json', ...(openaiKey ? { Authorization: `Bearer ${openaiKey}` } : {}) };
    const res = binding?.gateway
      ? await binding.gateway(gatewayId).run({ provider: 'openai', endpoint, headers, query: body })
      : await fetchImpl(`https://gateway.ai.cloudflare.com/v1/${accountId}/${gatewayId}/openai/${endpoint}`, {
        method: 'POST',
        headers: { ...headers, 'cf-aig-authorization': `Bearer ${apiToken}` },
        body: JSON.stringify(body),
      });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error?.message ?? data.errors?.[0]?.message ?? `AI Gateway returned ${res.status}`);
    return data;
  }
  return {
    async image(input) {
      const data = await call('images/generations', { ...input, output_format: 'jpeg', n: 1 });
      return { image: data.data?.[0]?.b64_json, usage: data.usage };
    },
  };
}


// TypeSafe Jev answers structured questions about a piece of text on Workers AI. Billed per input
// token only; each call carries a few hundred tokens of overhead on top of the text.
export const JEV = { model: 'typesafe/jev', label: 'TypeSafe Jev', input: 0.042, overheadTokens: 2000 };
export const jevMicros = (inputTokens) => Math.max(1, Math.ceil(inputTokens * JEV.input * markup()));

// "Urgent: needs action today, FYI" -> { Urgent: 'needs action today', FYI: 'FYI' }. A choice's
// description is optional and follows its first colon. Choices are split on new lines or
// semicolons when there are any, so descriptions can hold commas; otherwise on commas.
export function parseChoices(text) {
  const entries = text.split(/[\n;]/.test(text) ? /[\n;]+/ : /,+/).map((c) => c.trim()).filter(Boolean).map((c) => {
    const at = c.indexOf(':');
    const name = (at > 0 ? c.slice(0, at) : c).trim();
    return [name, (at > 0 ? c.slice(at + 1).trim() : '') || name];
  });
  return Object.fromEntries(entries);
}
const MAX_INSTRUCTIONS = 8000;

// Cloudflare error codes that mean the caller should retry later rather than fix the request.
const RATE_LIMIT_CODES = new Set([3036, 3040]);

// Same run(model, input) shape as the Workers AI binding, over the REST API. Used by
// `npm run dev:local`, where the binding's remote proxy needs Workers edit permissions.
export function restAi(accountId, apiToken, fetchImpl = globalThis.fetch) {
  return {
    async run(model, input) {
      // Partner models (no @cf/ prefix, like typesafe/jev) take { model, input } at /ai/run.
      const partner = !model.startsWith('@cf/');
      const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run${partner ? '' : `/${model}`}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(partner ? { model, input } : input),
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
export function createInference(billing, { ai, gateway } = {}) {
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

    // Workers AI hands back an answer that is pure JSON already parsed, so turn it back into text.
    const text = typeof result.response === 'string' ? result.response : result.response != null ? JSON.stringify(result.response) : '';
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
  // shortcut only sends { input, choice?, image?, instructions? }. A choice outside the
  // automation's list falls back to its first option, so nothing but the listed words reaches
  // the prompt. Building blocks (automation.block) take the person's own `instructions` in
  // place of {{instructions}}; Ask AI with no instructions treats the input as the whole prompt.
  async function runAutomation(user, automation, body) {
    let input = typeof body.input === 'string' ? body.input.trim() : '';
    const takesImage = automation.image || automation.acceptsImage;
    const image = takesImage && body.image ? body.image : undefined;
    if (automation.image && !image) return { status: 400, json: { error: 'There was no photo to look at. Take or share a photo, then run the shortcut again.' } };
    if (!input && !image) return { status: 400, json: { error: automation.emptyError ?? 'There was nothing to work with. Share some text, or copy it first, then run the shortcut again.' } };
    const choice = automation.choices ? (automation.choices.includes(body.choice) ? body.choice : automation.choices[0]) : '';
    const instructions = (typeof body.instructions === 'string' ? body.instructions.trim() : '') || automation.defaultInstructions || '';
    if (instructions.length > MAX_INSTRUCTIONS) return { status: 413, json: { error: 'Those instructions are too long. Keep them under 8,000 characters.' } };
    if (automation.needsInstructions && !instructions) return { status: 400, json: { error: automation.needsInstructions } };
    let prompt = automation.prompt.replace('{{choice}}', choice).replace('{{instructions}}', instructions).trim();
    if (!prompt) [prompt, input] = [input, ''];
    const model = image && automation.imageModel ? automation.imageModel : automation.model;
    const out = await generate(user, { prompt, input, image, model, system: automation.system });
    if (out.status !== 200 || !automation.format) return out;
    // The shortcut feeds the answer straight into Get Dictionary, so hand back
    // exactly that, or a readable error. The run is still charged: the model did the work.
    const clean = FORMATS[automation.format](out.json.text);
    if (!clean) return { status: 422, json: { ...out.json, error: automation.formatError } };
    return { status: 200, json: { ...out.json, text: clean } };
  }

  // Pick a Category: one Jev choice question. Returns the chosen name exactly as given, with
  // Jev's confidence alongside for anyone calling the API directly.
  async function pickChoice(user, automation, body) {
    if (!enabled) return { status: 503, json: { error: 'Inference is not configured on this server.' } };
    const input = typeof body.input === 'string' ? body.input.trim() : '';
    if (!input) return { status: 400, json: { error: 'There was nothing to sort. Pass some text first, then the choices.' } };
    const criteria = parseChoices(typeof body.instructions === 'string' ? body.instructions : '');
    const names = Object.keys(criteria);
    if (names.length < 2) return { status: 400, json: { error: automation.needsInstructions } };
    if (input.length + JSON.stringify(criteria).length > MAX_BODY_CHARS) return { status: 413, json: { error: 'That text is too long to sort.' } };
    // A token is never shorter than one character.
    const reserved = jevMicros(input.length + JSON.stringify(criteria).length + JEV.overheadTokens);
    if (!(await billing.reserve(user.id, reserved))) {
      return { status: 402, json: { error: `Not enough credit. This request can cost up to ${formatUsd(reserved, 4)}; top up at /account.`, balance_usd: (await billing.balance(user.id)) / MICROS } };
    }
    let out;
    try {
      out = (await ai.run(JEV.model, { state: input, questions: { category: { type: 'choice', instructions: 'Which one of these categories fits best?', criteria } } })) ?? {};
    } catch (err) {
      await billing.settle(user.id, reserved, 0, {});
      return { status: 502, json: { error: 'Model provider rejected the request.', errors: [{ message: String(err?.message ?? err) }] } };
    }
    // Over REST the answer sits one level down, under `result`.
    const result = out.answers ? out : out.result ?? {};
    const answer = result.answers?.category;
    const choice = names.includes(answer?.choice) ? answer.choice : null;
    const inputTokens = result.usage?.input_tokens ?? Math.ceil(input.length / 4) + 300;
    const actual = choice ? Math.min(jevMicros(inputTokens), reserved) : 0;
    await billing.settle(user.id, reserved, actual, { description: `${JEV.label}: ${inputTokens} in`, model: JEV.model, input_tokens: inputTokens, output_tokens: result.usage?.output_tokens ?? 0 });
    if (!choice) return { status: 502, json: { error: 'Model provider rejected the request.' } };
    return { status: 200, json: { text: choice, confidence: answer.confidence, probabilities: answer.probabilities, model: JEV.model, cost_usd: actual / MICROS, balance_usd: (await billing.balance(user.id)) / MICROS } };
  }

  // Make an Image: reserves for the largest picture the model makes at this size and quality,
  // then charges the tokens OpenAI reports. The JPEG comes back base64 in `text`.
  async function makeImage(user, automation, body) {
    if (!gateway) return { status: 503, json: { error: 'Image generation is not configured on this server.' } };
    const prompt = [body.input, body.instructions].filter((v) => typeof v === 'string' && v.trim()).join('. ').trim();
    if (!prompt) return { status: 400, json: { error: 'Describe the picture you want, then run the shortcut again.' } };
    if (prompt.length > MAX_IMAGE_PROMPT) return { status: 413, json: { error: 'That description is too long. Keep it under 2,000 characters.' } };
    const model = automation.model;
    const m = IMAGE_MODELS[model];
    // A token is never shorter than one character, so prompt length bounds the text tokens.
    const reserved = imageMicros(model, prompt.length, m.maxOutputTokens);
    if (!(await billing.reserve(user.id, reserved))) {
      return { status: 402, json: { error: `Not enough credit. An image can cost up to ${formatUsd(reserved, 4)}; top up at /account.`, balance_usd: (await billing.balance(user.id)) / MICROS } };
    }
    let result;
    try {
      result = (await gateway.image({ model, prompt, size: m.size, quality: m.quality })) ?? {};
    } catch (err) {
      await billing.settle(user.id, reserved, 0, {});
      const message = String(err?.message ?? err);
      // OpenAI refuses some prompts under its content policy; that is the person's to fix.
      if (/safety|policy|moderation/i.test(message)) return { status: 400, json: { error: 'That picture isn’t allowed. Try describing something else.' } };
      return { status: 502, json: { error: 'Model provider rejected the request.', errors: [{ message }] } };
    }
    if (typeof result.image !== 'string' || !result.image) {
      await billing.settle(user.id, reserved, 0, {});
      return { status: 502, json: { error: 'Model provider rejected the request.' } };
    }
    const inputTokens = result.usage?.input_tokens ?? Math.ceil(prompt.length / 4);
    const outputTokens = result.usage?.output_tokens ?? m.maxOutputTokens;
    const actual = Math.min(imageMicros(model, inputTokens, outputTokens), reserved);
    await billing.settle(user.id, reserved, actual, { description: `${m.label}: 1 image`, model, input_tokens: inputTokens, output_tokens: outputTokens });
    return { status: 200, json: { text: result.image, model, cost_usd: actual / MICROS, balance_usd: (await billing.balance(user.id)) / MICROS } };
  }

  // Reserves for the longest recording the file could hold, transcribes, then charges the
  // minutes Whisper reports.
  async function transcribe(user, bytes) {
    if (!enabled) return { status: 503, json: { error: 'Inference is not configured on this server.' } };
    const reserved = audioMicros(Math.max(1, bytes.byteLength / MIN_AUDIO_BYTES_PER_MINUTE));
    if (!(await billing.reserve(user.id, reserved))) {
      return { status: 402, json: { error: `Not enough credit. This recording can cost up to ${formatUsd(reserved, 4)}; top up at /account.`, balance_usd: (await billing.balance(user.id)) / MICROS } };
    }
    let result;
    try {
      result = (await ai.run(AUDIO_MODEL, { audio: base64(bytes) })) ?? {};
    } catch (err) {
      await billing.settle(user.id, reserved, 0, {});
      return { status: 502, json: { error: 'Model provider rejected the request.', errors: [{ message: String(err?.message ?? err) }] } };
    }
    const minutes = (result.transcription_info?.duration ?? 60) / 60;
    const actual = Math.min(audioMicros(minutes), reserved);
    await billing.settle(user.id, reserved, actual, {
      description: `${AUDIO_MODELS[AUDIO_MODEL].label}: ${minutes.toFixed(1)} min of audio`,
      model: AUDIO_MODEL, input_tokens: 0, output_tokens: 0,
    });
    return { status: 200, text: (result.text ?? '').trim(), cost_usd: actual / MICROS };
  }

  // Audio automations: transcribe the recording, then run the automation's prompt on the
  // transcript. The shortcut gets the summary with the full transcript underneath.
  async function runAudioAutomation(user, automation, bytes) {
    if (!bytes.byteLength) return { status: 400, json: { error: 'The recording was empty. Record again, then stop when you’re done.' } };
    if (bytes.byteLength > MAX_AUDIO_BYTES) return { status: 413, json: { error: 'That recording is too long. Recordings up to about 45 minutes work.' } };
    const heard = await transcribe(user, bytes);
    if (heard.status !== 200) return heard;
    if (!heard.text) return { status: 422, json: { error: 'Couldn’t hear any speech in that recording.' } };
    // Transcribe Audio has no prompt: the transcript is the answer.
    if (!automation.prompt) return { status: 200, json: { text: heard.text, model: AUDIO_MODEL, cost_usd: heard.cost_usd, balance_usd: (await billing.balance(user.id)) / MICROS } };
    const out = await generate(user, { prompt: automation.prompt, input: heard.text, model: automation.model });
    if (out.status !== 200) return out;
    return {
      status: 200,
      json: { ...out.json, text: `${dropEmptySections(out.json.text.trim())}\n\nTranscript\n${heard.text}`, cost_usd: out.json.cost_usd + heard.cost_usd },
    };
  }

  // Pass-through that mirrors Cloudflare's /ai/run/{model} REST request and response shape.
  async function run(user, model, body) {
    const out = await meteredRun(user, model, body ?? {});
    if (out.status !== 200) return { status: out.status, json: { success: false, ...out.json } };
    return { status: 200, json: { success: true, result: out.result, billing: out.billing } };
  }

  return { enabled, generate, run, runAutomation, runAudioAutomation, makeImage, pickChoice };
}
