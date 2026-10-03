import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryD1 } from './d1.js';
import { createBilling } from '../src/billing.js';

const fakeStripe = (missing) => {
  const calls = [];
  return {
    calls,
    checkout: { sessions: { create: async (params) => {
      calls.push(params);
      if (params.customer === missing) throw Object.assign(new Error('No such customer'), { code: 'resource_missing', param: 'customer' });
      return { url: `https://checkout.stripe.com/c/${calls.length}` };
    } } },
  };
};

test('checkout drops a saved customer that does not exist under the current key', async () => {
  const db = memoryD1();
  db.raw.exec("INSERT INTO users (id,email,password_hash,balance_micros,stripe_customer_id,created_at) VALUES (1,'a@example.com','',0,'cus_sandbox',0)");
  const client = fakeStripe('cus_sandbox');
  const billing = createBilling(db, { client, appUrl: 'http://localhost' });
  const user = db.raw.prepare('SELECT * FROM users WHERE id = 1').get();

  assert.equal(await billing.createCheckout(user, 5), 'https://checkout.stripe.com/c/2');
  assert.equal(client.calls[0].customer, 'cus_sandbox');
  assert.equal(client.calls[1].customer, undefined);
  assert.equal(client.calls[1].customer_email, 'a@example.com');
  assert.equal(db.raw.prepare('SELECT stripe_customer_id FROM users WHERE id = 1').get().stripe_customer_id, null);
});

test('checkout keeps a valid saved customer and surfaces other Stripe errors', async () => {
  const db = memoryD1();
  db.raw.exec("INSERT INTO users (id,email,password_hash,balance_micros,stripe_customer_id,created_at) VALUES (1,'a@example.com','',0,'cus_live',0)");
  const client = fakeStripe('cus_other');
  const billing = createBilling(db, { client, appUrl: 'http://localhost' });
  const user = db.raw.prepare('SELECT * FROM users WHERE id = 1').get();
  await billing.createCheckout(user, 10);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].customer, 'cus_live');

  client.checkout.sessions.create = async () => { throw Object.assign(new Error('Invalid API Key'), { type: 'StripeAuthenticationError' }); };
  await assert.rejects(billing.createCheckout(user, 10), /Invalid API Key/);
  assert.equal(db.raw.prepare('SELECT stripe_customer_id FROM users WHERE id = 1').get().stripe_customer_id, 'cus_live');
});
