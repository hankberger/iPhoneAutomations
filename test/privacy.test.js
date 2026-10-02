import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aiGateway } from '../src/inference.js';

test('image requests opt out of gateway logs and caches for both transports', async () => {
  for (const binding of [true, false]) {
    let captured;
    const response = () => Response.json({ data: [{ b64_json: 'image' }], usage: {} });
    const gateway = aiGateway({
      ...(binding ? { binding: { gateway: () => ({ run: async request => { captured = request; return response(); } }) } } : {}),
      accountId: 'test-account', apiToken: 'test-token',
      fetchImpl: async (_url, init) => { captured = init; return response(); },
    });
    await gateway.image({ prompt: 'test' });
    assert.equal(captured.headers['cf-aig-collect-log'], 'false');
    assert.equal(captured.headers['cf-aig-skip-cache'], 'true');
  }
});
