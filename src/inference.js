import { MICROS, formatUsd } from './billing.js';

// Cloudflare Workers AI text models we resell, with Cloudflare's USD price per million tokens.
// Check these against developers.cloudflare.com/workers-ai/platform/pricing before launch.
export const MODELS = {
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast': { label: 'Llama 3.3 70B', input: 0.293, output: 2.253 },
  '@cf/mistralai/mistral-small-3.1-24b-instruct': { label: 'Mistral Small 3.1', input: 0.351, output: 0.555 },
  '@cf/meta/llama-3.1-8b-instruct-fp8-fast': { label: 'Llama 3.1 8B', input: 0.045, output: 0.384 },
};
export const DEFAULT_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const DEFAULT_MAX_TOKENS = 1024;
const MAX_TOKENS_CAP = 4096;
const MAX_BODY_CHARS = 200_000;

export const markup = () => Number(process.env.MARKUP || 1.5);

// Micro-dollars charged to the user: tokens x $/M x markup, and 1 micro-dollar = $1/M.
export function costMicros(model, inputTokens, outputTokens) {
  const p = MODELS[model] ?? MODELS[DEFAULT_MODEL];
  return Math.ceil((inputTokens * p.input + outputTokens * p.output) * markup());
}

export const retailPrice = (model) => ({
  input: MODELS[model].input * markup(),
  output: MODELS[model].output * markup(),
});

export function createInference(billing, {
  fetch: fetchImpl = globalThis.fetch,
  accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
  apiToken = process.env.CLOUDFLARE_API_TOKEN,
} = {}) {
  const enabled = Boolean(accountId && apiToken);
  const runUrl = (model) => `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

  // Reserves the worst case, calls Cloudflare, then charges actual usage and refunds the rest.
  async function meteredRun(user, model, payload) {
    if (!enabled) return { status: 503, json: { error: 'Inference is not configured on this server.' } };
    if (!MODELS[model]) return { status: 400, json: { error: `Unsupported model. Use one of: ${Object.keys(MODELS).join(', ')}` } };
    if (payload.stream) return { status: 400, json: { error: 'Streaming is not supported yet. Remove "stream": true.' } };

    const requested = Number(payload.max_tokens);
    const maxTokens = Math.min(Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_MAX_TOKENS, MAX_TOKENS_CAP);
    const body = JSON.stringify({ ...payload, max_tokens: maxTokens, stream: false });
    if (body.length > MAX_BODY_CHARS) return { status: 413, json: { error: 'Request is too large.' } };

    // A token is never shorter than one character, so body length bounds the input tokens.
    const reserved = costMicros(model, body.length, maxTokens);
    if (!billing.reserve(user.id, reserved)) {
      return {
        status: 402,
        json: { error: `Not enough credit. This request can cost up to ${formatUsd(reserved, 4)}; top up at /account.`, balance_usd: billing.balance(user.id) / MICROS },
      };
    }

    let upstream;
    let data;
    try {
      upstream = await fetchImpl(runUrl(model), {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
        body,
      });
      data = await upstream.json();
    } catch {
      billing.settle(user.id, reserved, 0, {});
      return { status: 502, json: { error: 'Could not reach the model provider.' } };
    }

    if (!upstream.ok || data?.success === false) {
      billing.settle(user.id, reserved, 0, {});
      const status = upstream.status === 429 ? 429 : upstream.status >= 400 && upstream.status < 500 ? 400 : 502;
      return { status, json: { error: 'Model provider rejected the request.', errors: data?.errors ?? [] } };
    }

    const result = data.result ?? {};
    const text = typeof result.response === 'string' ? result.response : '';
    // Most Workers AI text models report usage; estimate at ~4 characters per token when one does not.
    const inputTokens = result.usage?.prompt_tokens ?? Math.ceil(body.length / 4);
    const outputTokens = result.usage?.completion_tokens ?? Math.ceil(JSON.stringify(result.response ?? '').length / 4);
    const actual = Math.min(costMicros(model, inputTokens, outputTokens), reserved);
    billing.settle(user.id, reserved, actual, {
      description: `${MODELS[model].label}: ${inputTokens} in / ${outputTokens} out`,
      model, input_tokens: inputTokens, output_tokens: outputTokens,
    });

    return {
      status: 200,
      result,
      text,
      billing: { cost_usd: actual / MICROS, balance_usd: billing.balance(user.id) / MICROS, usage: { input_tokens: inputTokens, output_tokens: outputTokens } },
    };
  }

  // Shortcuts-friendly: { prompt, input?, system?, model?, max_tokens? } -> { text, ... }
  async function generate(user, body) {
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) return { status: 400, json: { error: 'Send a "prompt" string.' } };
    const model = body.model ?? DEFAULT_MODEL;
    const input = typeof body.input === 'string' ? body.input : '';
    const messages = [
      ...(typeof body.system === 'string' ? [{ role: 'system', content: body.system }] : []),
      { role: 'user', content: input ? `${prompt}\n\n<input>\n${input}\n</input>` : prompt },
    ];
    const out = await meteredRun(user, model, { messages, max_tokens: body.max_tokens });
    if (out.status !== 200) return out;
    return { status: 200, json: { text: out.text, model, ...out.billing } };
  }

  // Pass-through that mirrors Cloudflare's /ai/run/{model} request and response shape.
  async function run(user, model, body) {
    const out = await meteredRun(user, model, body ?? {});
    if (out.status !== 200) return { status: out.status, json: { success: false, ...out.json } };
    return { status: 200, json: { success: true, result: out.result, billing: out.billing } };
  }

  return { enabled, generate, run };
}
