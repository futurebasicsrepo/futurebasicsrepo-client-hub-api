// Staff: anyone signed in with a confirmed email at the company's domain
// (SPOT_ADMIN_DOMAIN, default thefuturebasics.com; set it to "" to turn this
// off) can open /admin and /admin/health without the admin token.
//
// "Confirmed" means Spot itself checked the address: a sign-in code sent to
// it, a code to add it to an account, or Google saying it's verified. An
// email that only came from somewhere else (a Facebook profile) doesn't count.
const key = (userId) => `email_proven:${userId}`;

export function staffDomain(env = process.env) {
  const d = env.SPOT_ADMIN_DOMAIN ?? 'thefuturebasics.com';
  return String(d).trim().toLowerCase().replace(/^@/, '') || null;
}

export function proveEmail(db, userId, email) {
  if (userId && email) db.state.set(key(userId), { email: String(email).toLowerCase(), at: Date.now() });
}

export function isStaff(db, env, userId) {
  const domain = staffDomain(env);
  if (!domain || !userId) return false;
  const email = db.users.byId(userId)?.email?.toLowerCase();
  if (!email || !email.endsWith(`@${domain}`)) return false;
  return db.state.get(key(userId))?.email === email;
}
