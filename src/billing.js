import Stripe from 'stripe';
import { tx } from './db.js';

export const MICROS = 1_000_000;
export const TOPUP_AMOUNTS = [5, 10, 25, 50]; // USD
export const formatUsd = (micros, digits = 2) =>
  `$${(micros / MICROS).toFixed(digits)}`;

export function createBilling(db, { stripeKey = process.env.STRIPE_SECRET_KEY, webhookSecret = process.env.STRIPE_WEBHOOK_SECRET, appUrl } = {}) {
  const stripe = stripeKey ? new Stripe(stripeKey) : null;
  const q = {
    credit: db.prepare('UPDATE users SET balance_micros = balance_micros + ? WHERE id = ?'),
    // Only succeeds when the balance covers the debit, which makes reservations race-safe.
    debit: db.prepare('UPDATE users SET balance_micros = balance_micros - ? WHERE id = ? AND balance_micros >= ?'),
    balance: db.prepare('SELECT balance_micros FROM users WHERE id = ?'),
    topupExists: db.prepare('SELECT 1 FROM ledger WHERE stripe_session_id = ?'),
    ledger: db.prepare(`INSERT INTO ledger (user_id, kind, amount_micros, description, stripe_session_id, model, input_tokens, output_tokens, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    history: db.prepare('SELECT * FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?'),
    setCustomer: db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?'),
  };

  // Idempotent: Stripe retries webhooks and the success page may also call this.
  function fulfillCheckout(session) {
    if (session.payment_status !== 'paid') return false;
    const userId = Number(session.metadata?.user_id);
    const credit = Number(session.metadata?.credit_micros);
    if (!userId || !credit) return false;
    return tx(db, () => {
      if (q.topupExists.get(session.id)) return false;
      q.credit.run(credit, userId);
      q.ledger.run(userId, 'topup', credit, `Added ${formatUsd(credit)} credit`, session.id, null, null, null, Date.now());
      if (session.customer) q.setCustomer.run(String(session.customer), userId);
      return true;
    });
  }

  async function createCheckout(user, dollars) {
    if (!stripe) throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY.');
    if (!TOPUP_AMOUNTS.includes(dollars)) throw new Error('Unsupported amount.');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      ...(user.stripe_customer_id ? { customer: user.stripe_customer_id } : { customer_email: user.email, customer_creation: 'always' }),
      client_reference_id: String(user.id),
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: dollars * 100,
          product_data: { name: `Advanced Automations credit`, description: `$${dollars} of AI credit for your automations` },
        },
      }],
      metadata: { user_id: String(user.id), credit_micros: String(dollars * MICROS) },
      success_url: `${appUrl}/account?checkout={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/account?checkout=cancelled`,
    });
    return session.url;
  }

  async function confirmCheckout(sessionId, userId) {
    if (!stripe) return false;
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (Number(session.metadata?.user_id) !== userId) return false;
    return fulfillCheckout(session);
  }

  function handleWebhook(rawBody, signature) {
    if (!stripe || !webhookSecret) throw new Error('Stripe webhook is not configured.');
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      fulfillCheckout(event.data.object);
    }
    return event.type;
  }

  // Holds the worst-case cost before calling upstream so concurrent calls cannot overdraw.
  function reserve(userId, micros) {
    return q.debit.run(micros, userId, micros).changes === 1;
  }

  function settle(userId, reserved, actual, meta) {
    tx(db, () => {
      const refund = reserved - actual;
      if (refund > 0) q.credit.run(refund, userId);
      else if (refund < 0) db.prepare('UPDATE users SET balance_micros = MAX(0, balance_micros - ?) WHERE id = ?').run(-refund, userId);
      if (actual > 0) {
        q.ledger.run(userId, 'usage', -actual, meta.description, null, meta.model, meta.input_tokens, meta.output_tokens, Date.now());
      }
    });
  }

  return {
    enabled: Boolean(stripe),
    webhookEnabled: Boolean(stripe && webhookSecret),
    createCheckout, confirmCheckout, handleWebhook, fulfillCheckout, reserve, settle,
    balance: (userId) => q.balance.get(userId)?.balance_micros ?? 0,
    history: (userId, limit = 25) => q.history.all(userId, limit),
  };
}
