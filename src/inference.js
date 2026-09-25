import Anthropic from '@anthropic-ai/sdk';
import { MICROS, formatUsd } from './billing.js';

// Anthropic list prices in USD per million tokens. We charge list price times MARKUP.
export const MODELS = {
  'claude-opus-5': { label: 'Opus 5', input: 5, output: 25 },
  'claude-sonnet-5': { label: 'Sonnet 5', input: 2, output: 10 },
  'claude-haiku-4-5': { label: 'Haiku 4.5', input: 1, output: 5 },
};
export const DEFAULT_MODEL = 'claude-opus-5';
const MAX_TOKENS_CAP = 16000;
const MAX_INPUT_CHARS = 200_000;

export const markup = () => Number(process.env.MARKUP || 1.5);

export function costMicros(model, inputTokens, outputTokens) {
  const p = MODELS[model] ?? MODELS[DEFAULT_MODEL];
  return Math.ceil(((inputTokens * p.input + outputTokens * p.output) * markup()));
}

// Retail price per million tokens, for display.
export const retailPrice = (model) => ({
  input: MODELS[model].input * markup(),
  output: MODELS[model].output * markup(),
});

export function createInference(billing, { client } = {}) {
  const anthropic = client ?? (process.env.ANTHROPIC_API_KEY ? new Anthropic() : null);

  // Shortcuts-friendly body: { prompt, input?, system?, model?, max_tokens? } -> { text, ... }
  async function generate(user, body) {
    if (!anthropic) return { status: 503, json: { error: 'Inference is not configured on this server.' } };

    const model = body.model ?? DEFAULT_MODEL;
    if (!MODELS[model]) return { status: 400, json: { error: `Unknown model. Use one of: ${Object.keys(MODELS).join(', ')}` } };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) return { status: 400, json: { error: 'Send a "prompt" string.' } };
    const input = typeof body.input === 'string' ? body.input : '';
    const system = typeof body.system === 'string' ? body.system : undefined;
    const content = input ? `${prompt}\n\n<input>\n${input}\n</input>` : prompt;
    if (content.length + (system?.length ?? 0) > MAX_INPUT_CHARS) return { status: 413, json: { error: 'Input is too long.' } };
    const maxTokens = Math.min(Math.max(Number(body.max_tokens) || MAX_TOKENS_CAP, 1), MAX_TOKENS_CAP);

    // Worst case: every character is a token, and the model uses all of max_tokens.
    const reserved = costMicros(model, content.length + (system?.length ?? 0) + 50, maxTokens);
    if (!billing.reserve(user.id, reserved)) {
      return {
        status: 402,
        json: { error: `Not enough credit. This request can cost up to ${formatUsd(reserved, 4)}; top up at /account.`, balance_usd: billing.balance(user.id) / MICROS },
      };
    }

    let response;
    try {
      const params = {
        model,
        max_tokens: maxTokens,
        ...(system && { system }),
        messages: [{ role: 'user', content }],
      };
      // Opus 5 can decline some requests; let the API retry on a fallback model instead of failing.
      response = model === 'claude-opus-5'
        ? await anthropic.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : await anthropic.messages.create(params);
    } catch (err) {
      billing.settle(user.id, reserved, 0, {});
      if (err instanceof Anthropic.RateLimitError) return { status: 429, json: { error: 'Upstream is busy. Try again shortly.' } };
      if (err instanceof Anthropic.APIConnectionError) return { status: 502, json: { error: 'Could not reach the model provider.' } };
      if (err instanceof Anthropic.APIError) return { status: 502, json: { error: `Model provider error (${err.status}).` } };
      throw err;
    }

    const servedModel = MODELS[response.model] ? response.model : model;
    const { input_tokens, output_tokens } = response.usage;
    const actual = Math.min(costMicros(servedModel, input_tokens, output_tokens), reserved);
    billing.settle(user.id, reserved, actual, {
      description: `${MODELS[servedModel].label}: ${input_tokens} in / ${output_tokens} out`,
      model: servedModel, input_tokens, output_tokens,
    });

    const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const out = {
      text,
      model: servedModel,
      stop_reason: response.stop_reason,
      usage: { input_tokens, output_tokens },
      cost_usd: actual / MICROS,
      balance_usd: billing.balance(user.id) / MICROS,
    };
    if (response.stop_reason === 'refusal') return { status: 422, json: { ...out, error: 'The model declined this request.' } };
    return { status: 200, json: out };
  }

  return { enabled: Boolean(anthropic), generate };
}
