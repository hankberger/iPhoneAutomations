export const DAY = 86_400_000;
const list = value => String(value || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

export function isAdmin(user, env) {
  if (!user) return false;
  return list(env.ADMIN_USER_IDS).includes(String(user.id)) ||
    (Boolean(user.email_verified_at) && list(env.ADMIN_EMAILS).includes(user.email.toLowerCase()));
}

// Metadata is intentionally allowlisted. Never persist payloads, prompts, keys or errors.
export async function recordEvent(db, event, { userId = null, slug = null, status = null, durationMs = null, source = null } = {}) {
  try {
    await db.prepare(`INSERT INTO analytics_events
      (event_name, user_id, slug, status, duration_ms, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(event, userId, slug, status, durationMs, source, Date.now()).run();
  } catch { console.error('Analytics write failed'); }
}

// Paid credit is its face value, not recognized revenue or net proceeds. Welcome credit,
// manual grants and Apple sandbox transactions are excluded. Stripe is production in prod.
const paid = `l.kind = 'topup' AND (l.stripe_session_id LIKE 'cs_live_%' OR
  l.apple_event_id IN (SELECT 'purchase:' || id FROM app_store_transactions WHERE environment = 'Production'))`;
export const ratio = (n, d) => d ? n / d : null;

export async function dashboardData(db, requestedDays, { now = Date.now() } = {}) {
  const days = [7, 30, 90].includes(Number(requestedDays)) ? Number(requestedDays) : 30;
  const end = Math.floor(now / DAY) * DAY;
  const start = end - days * DAY;
  const previousStart = start - days * DAY;
  const all = async (sql, ...args) => (await db.prepare(sql).bind(...args).all()).results;
  const state = await db.prepare("SELECT value FROM analytics_state WHERE key = 'tracking_started_at'").first();
  const trackingSince = Number(state?.value ?? now);
  const cohortStart = Math.max(start, trackingSince);
  const [periods, weekly, daily, features, cohorts, money, failures, sources, today] = await Promise.all([
    all(`WITH per_user AS (
      SELECT CASE WHEN created_at >= ? THEN 'current' ELSE 'previous' END AS period, user_id,
        COUNT(*) AS attempts, SUM(event_name = 'run_succeeded') AS runs,
        COUNT(DISTINCT CASE WHEN event_name = 'run_succeeded' THEN created_at / ${DAY} END) AS active_days
      FROM analytics_events WHERE event_name IN ('run_succeeded', 'run_failed') AND user_id IS NOT NULL
        AND created_at >= ? AND created_at < ? GROUP BY period, user_id)
      SELECT period, SUM(attempts) AS attempts, SUM(runs) AS runs,
        SUM(runs > 0) AS active, SUM(active_days >= 2) AS repeat_users,
        SUM(active_days) AS active_days FROM per_user GROUP BY period`, start, previousStart, end),
    all(`WITH activity AS (
      SELECT user_id,
        COUNT(DISTINCT CASE WHEN created_at >= ? THEN created_at / ${DAY} END) AS this_week,
        COUNT(DISTINCT CASE WHEN created_at < ? THEN created_at / ${DAY} END) AS last_week
      FROM analytics_events WHERE event_name = 'run_succeeded' AND user_id IS NOT NULL
        AND created_at >= ? AND created_at < ? GROUP BY user_id)
      SELECT COALESCE(SUM(this_week > 0), 0) AS active,
        COALESCE(SUM(this_week >= 2), 0) AS repeat_users,
        COALESCE(SUM(last_week >= 2), 0) AS previous_repeat_users,
        COALESCE(SUM(last_week > 0), 0) AS previous_active,
        COALESCE(SUM(last_week > 0 AND this_week > 0), 0) AS retained,
        COALESCE(SUM(last_week > 0 AND this_week = 0), 0) AS lapsed FROM activity`, end - 7 * DAY, end - 7 * DAY, end - 14 * DAY, end),
    all(`SELECT created_at / ${DAY} AS day, SUM(event_name = 'run_succeeded') AS runs,
      SUM(event_name = 'run_failed') AS failures,
      COUNT(DISTINCT CASE WHEN event_name = 'run_succeeded' THEN user_id END) AS active
      FROM analytics_events WHERE event_name IN ('run_succeeded', 'run_failed') AND user_id IS NOT NULL
        AND created_at >= ? AND created_at < ? GROUP BY day ORDER BY day`, start, end),
    all(`WITH runs AS (
      SELECT * FROM analytics_events WHERE event_name IN ('run_succeeded', 'run_failed')
        AND user_id IS NOT NULL AND created_at >= ? AND created_at < ?),
      people AS (SELECT slug, user_id, COUNT(DISTINCT created_at / ${DAY}) AS days FROM runs
        WHERE event_name = 'run_succeeded' GROUP BY slug, user_id),
      latency AS (SELECT slug, duration_ms, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY duration_ms) AS rank,
        COUNT(*) OVER (PARTITION BY slug) AS n FROM runs WHERE duration_ms IS NOT NULL AND event_name = 'run_succeeded')
      SELECT r.slug, COUNT(*) AS attempts, SUM(r.event_name = 'run_succeeded') AS runs,
        COUNT(DISTINCT CASE WHEN r.event_name = 'run_succeeded' THEN r.user_id END) AS users,
        SUM(r.status = 402) AS credit_blocks,
        (SELECT COUNT(*) FROM people p WHERE p.slug = r.slug AND p.days >= 2) AS repeat_users,
        (SELECT duration_ms FROM latency t WHERE t.slug = r.slug AND t.rank = (95 * t.n + 99) / 100) AS p95_ms
      FROM runs r GROUP BY r.slug ORDER BY users DESC, runs DESC`, start, end),
    all(`WITH accounts AS (
      SELECT u.id, u.created_at,
        MIN(CASE WHEN e.event_name = 'run_succeeded' THEN e.created_at END) AS first_run,
        MAX(e.event_name = 'run_succeeded' AND e.created_at >= u.created_at + ${7 * DAY}
          AND e.created_at < u.created_at + ${14 * DAY}) AS returned_week1,
        MAX(e.event_name = 'run_succeeded' AND e.created_at >= u.created_at + ${28 * DAY}
          AND e.created_at < u.created_at + ${35 * DAY}) AS returned_week4,
        (SELECT MIN(l.created_at) FROM ledger l WHERE l.user_id = u.id AND ${paid}) AS first_paid
      FROM users u LEFT JOIN analytics_events e ON e.user_id = u.id AND e.event_name = 'run_succeeded'
        AND e.created_at >= u.created_at AND e.created_at < ?
      WHERE u.created_at >= ? AND u.created_at < ? GROUP BY u.id)
      SELECT date(created_at / 1000, 'unixepoch', '-6 days', 'weekday 1') AS week,
        COUNT(*) AS signups,
        SUM(created_at <= ? - ${7 * DAY}) AS eligible7,
        SUM(CASE WHEN created_at <= ? - ${7 * DAY} AND first_run < created_at + ${7 * DAY} THEN 1 ELSE 0 END) AS activated7,
        SUM(CASE WHEN created_at <= ? - ${7 * DAY} AND first_run < created_at + ${7 * DAY} THEN first_run - created_at ELSE 0 END) AS activation_ms,
        SUM(CASE WHEN created_at <= ? - ${14 * DAY} AND first_run < created_at + ${7 * DAY} THEN 1 ELSE 0 END) AS eligible14,
        SUM(CASE WHEN created_at <= ? - ${14 * DAY} AND first_run < created_at + ${7 * DAY} AND returned_week1 THEN 1 ELSE 0 END) AS retained14,
        SUM(CASE WHEN created_at <= ? - ${35 * DAY} AND first_run < created_at + ${7 * DAY} THEN 1 ELSE 0 END) AS eligible35,
        SUM(CASE WHEN created_at <= ? - ${35 * DAY} AND first_run < created_at + ${7 * DAY} AND returned_week4 THEN 1 ELSE 0 END) AS retained35,
        SUM(created_at <= ? - ${30 * DAY}) AS eligible30,
        SUM(CASE WHEN created_at <= ? - ${30 * DAY} AND first_paid < created_at + ${30 * DAY} THEN 1 ELSE 0 END) AS paid30
      FROM accounts GROUP BY week ORDER BY week`, end, cohortStart, end, end, end, end, end, end, end, end, end, end),
    all(`WITH purchases AS (SELECT l.* FROM ledger l WHERE ${paid}),
      buyers AS (SELECT user_id, MIN(created_at) AS first_paid FROM purchases GROUP BY user_id)
      SELECT
        (SELECT COUNT(*) FROM users WHERE created_at >= ? AND created_at < ?) AS signups,
        (SELECT COALESCE(SUM(amount_micros), 0) FROM purchases WHERE created_at >= ? AND created_at < ?) AS purchased,
        (SELECT COALESCE(SUM(amount_micros), 0) FROM purchases WHERE created_at >= ? AND created_at < ?) AS previous_purchased,
        (SELECT COUNT(DISTINCT user_id) FROM purchases WHERE created_at >= ? AND created_at < ?) AS buyers,
        (SELECT COUNT(*) FROM buyers WHERE first_paid >= ? AND first_paid < ?) AS first_buyers,
        (SELECT COUNT(*) FROM purchases WHERE created_at >= ? AND created_at < ?) AS purchases,
        (SELECT COALESCE(-SUM(amount_micros), 0) FROM ledger WHERE kind = 'usage' AND created_at >= ? AND created_at < ?) AS consumed,
        (SELECT COALESCE(SUM(amount_micros), 0) FROM ledger l WHERE kind = 'topup' AND stripe_session_id IS NULL AND apple_event_id IS NULL AND created_at >= ? AND created_at < ?) AS granted,
        (SELECT COUNT(DISTINCT e.user_id) FROM analytics_events e JOIN buyers b ON b.user_id = e.user_id
          WHERE e.event_name = 'run_succeeded' AND e.created_at >= ? AND e.created_at < ? AND b.first_paid < ?) AS active_payers`,
      start, end, start, end, previousStart, start, start, end, start, end, start, end, start, end, start, end, start, end, end),
    all(`SELECT status, COUNT(*) AS attempts, COUNT(DISTINCT user_id) AS users FROM analytics_events
      WHERE event_name = 'run_failed' AND user_id IS NOT NULL AND created_at >= ? AND created_at < ?
      GROUP BY status ORDER BY attempts DESC`, start, end),
    all(`SELECT COALESCE(source, 'unknown') AS source, COUNT(*) AS attempts,
      SUM(event_name = 'run_succeeded') AS runs,
      COUNT(DISTINCT CASE WHEN event_name = 'run_succeeded' THEN user_id END) AS users
      FROM analytics_events WHERE event_name IN ('run_succeeded', 'run_failed') AND user_id IS NOT NULL
        AND created_at >= ? AND created_at < ? GROUP BY source ORDER BY runs DESC`, start, end),
    all(`SELECT COUNT(*) AS attempts, COALESCE(SUM(event_name = 'run_succeeded'), 0) AS runs,
      COUNT(DISTINCT CASE WHEN event_name = 'run_succeeded' THEN user_id END) AS active,
      MAX(created_at) AS last_event FROM analytics_events
      WHERE event_name IN ('run_succeeded', 'run_failed') AND user_id IS NOT NULL AND created_at >= ? AND created_at <= ?`, end, now),
  ]);
  const empty = { attempts: 0, runs: 0, active: 0, repeat_users: 0, active_days: 0 };
  const current = { ...empty, ...periods.find(p => p.period === 'current') };
  const previous = { ...empty, ...periods.find(p => p.period === 'previous') };
  const totals = Object.fromEntries(['signups', 'eligible7', 'activated7', 'activation_ms', 'eligible14', 'retained14', 'eligible35', 'retained35', 'eligible30', 'paid30'].map(k => [k, cohorts.reduce((n, c) => n + (c[k] || 0), 0)]));
  const dayMap = new Map(daily.map(d => [d.day, d]));
  return { days, start, end, trackingSince, updatedAt: now,
    coverage: { period: trackingSince <= start, comparison: trackingSince <= previousStart, weekly: trackingSince <= end - 14 * DAY },
    current, previous, weekly: weekly[0], cohorts, totals, money: money[0], failures, features, sources, today: today[0],
    daily: Array.from({ length: days }, (_, i) => {
      const time = start + i * DAY;
      return { time, covered: time >= trackingSince, runs: 0, active: 0, failures: 0, ...dayMap.get(time / DAY) };
    }),
  };
}
