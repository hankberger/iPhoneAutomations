import Stripe from 'stripe';

export const MICROS = 1_000_000;
export const TOPUP_AMOUNTS = [5, 10, 25, 50]; // USD
export const formatUsd = (micros, digits = 2) =>
  `$${(micros / MICROS).toFixed(digits)}`;

export function createBilling(db, { stripeKey, webhookSecret, appUrl } = {}) {
  const stripe = stripeKey ? new Stripe(stripeKey, { httpClient: Stripe.createFetchHttpClient() }) : null;
  const q = {
    credit: db.prepare('UPDATE users SET balance_micros = balance_micros + ? WHERE id = ?'),
    // Only succeeds when the balance covers the debit, which makes reservations race-safe.
    debit: db.prepare('UPDATE users SET balance_micros = balance_micros - ? WHERE id = ? AND balance_micros >= ?'),
    balance: db.prepare('SELECT balance_micros FROM users WHERE id = ?'),
    // Existence checks belong inside the writes, not in a separate read that can
    // race deletion. A late settlement/payment must be a no-op for a deleted ID.
    ledger: db.prepare(`INSERT INTO ledger (user_id, kind, amount_micros, description, stripe_session_id, model, input_tokens, output_tokens, created_at)
                        SELECT id, ?, ?, ?, ?, ?, ?, ?, ? FROM users WHERE id = ?`),
    topupLedger: db.prepare(`INSERT INTO ledger (user_id, kind, amount_micros, description, stripe_session_id, created_at)
                             SELECT id, 'topup', ?, ?, ?, ? FROM users WHERE id = ?
                             ON CONFLICT (stripe_session_id) DO NOTHING`),
    // changes() is the row count of the ledger insert just before it in the same batch,
    // so a replayed session or deleted account inserts nothing and credits nothing.
    topupCredit: db.prepare('UPDATE users SET balance_micros = balance_micros + ? WHERE id = ? AND changes() = 1'),
    history: db.prepare('SELECT * FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?'),
    setCustomer: db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?'),
  };

  // Idempotent: Stripe retries webhooks and the success page may also call this.
  async function fulfillCheckout(session) {
    if (session.payment_status !== 'paid') return false;
    const userId = Number(session.metadata?.user_id);
    const credit = Number(session.metadata?.credit_micros);
    if (!Number.isSafeInteger(userId) || userId <= 0 || !Number.isSafeInteger(credit) || credit <= 0) return false;
    // A D1 batch runs as one transaction.
    const [inserted] = await db.batch([
      q.topupLedger.bind(credit, `Added ${formatUsd(credit)} credit`, session.id, Date.now(), userId),
      q.topupCredit.bind(credit, userId),
    ]);
    if (inserted.meta.changes !== 1) return false;
    if (session.customer) await q.setCustomer.bind(String(session.customer), userId).run();
    return true;
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

  async function handleWebhook(rawBody, signature) {
    if (!stripe || !webhookSecret) throw new Error('Stripe webhook is not configured.');
    const event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret, undefined, Stripe.createSubtleCryptoProvider());
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      await fulfillCheckout(event.data.object);
    }
    return event.type;
  }

  // Holds the worst-case cost before calling upstream so concurrent calls cannot overdraw.
  async function reserve(userId, micros) {
    const { meta } = await q.debit.bind(micros, userId, micros).run();
    return meta.changes === 1;
  }

  // actual never exceeds reserved (the caller caps it), so this only ever refunds.
  async function settle(userId, reserved, actual, meta) {
    const stmts = [];
    if (reserved > actual) stmts.push(q.credit.bind(reserved - actual, userId));
    if (actual > 0) {
      stmts.push(q.ledger.bind('usage', -actual, meta.description, null, meta.model, meta.input_tokens, meta.output_tokens, Date.now(), userId));
    }
    if (stmts.length) await db.batch(stmts);
  }

  return {
    enabled: Boolean(stripe),
    webhookEnabled: Boolean(stripe && webhookSecret),
    createCheckout, confirmCheckout, handleWebhook, fulfillCheckout, reserve, settle,
    balance: async (userId) => (await q.balance.bind(userId).first())?.balance_micros ?? 0,
    history: async (userId, limit = 25) => (await q.history.bind(userId, limit).all()).results,
  };
}
