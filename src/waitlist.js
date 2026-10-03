// Mobile app waitlist. Signups go to Hank's shared Waitlist D1 database (binding WAITLIST_DB),
// whose waitlist_signups table is shared across projects and is unique on (project, email).
export const WAITLIST_PROJECT = 'iPhoneAutomation';
export const WAITLIST_COOKIE = 'aa_waitlist';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!EMAIL.test(e) || e.length > 254) return { error: 'Enter a valid email address.' };
  return { email: e };
}

// Returns { joined: true, already } or { error, status }.
export async function joinWaitlist(db, rawEmail) {
  const v = validateEmail(rawEmail);
  if (v.error) return { error: v.error, status: 400 };
  if (!db) return { error: 'The waitlist is not available right now. Try again later.', status: 503 };
  try {
    const { meta } = await db.prepare('INSERT INTO waitlist_signups (email, project) VALUES (?, ?) ON CONFLICT (project, email) DO NOTHING')
      .bind(v.email, WAITLIST_PROJECT).run();
    return { joined: true, already: meta.changes === 0 };
  } catch (err) {
    console.error('waitlist insert failed', err);
    return { error: 'The waitlist is not available right now. Try again later.', status: 503 };
  }
}
