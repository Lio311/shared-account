import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'shared_account_session';
const TTL_SECONDS = 12 * 60 * 60;
const attempts = new Map();

function secret() {
  const source = process.env.AUTH_SECRET || process.env.DATABASE_URL;
  if (!source) throw new Error('Authentication is not configured');
  return createHmac('sha256', source).update('shared-account-session-v1').digest();
}

function signature(payload) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function session(req) {
  const cookie = String(req.headers?.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${COOKIE}=`));
  if (!cookie) return null;
  try {
    const token = cookie.slice(COOKIE.length + 1);
    const [payload, sig, extra] = token.split('.');
    if (extra || !payload || !sig || !safeEqual(sig, signature(payload))) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!Number.isSafeInteger(data.expires) || data.expires <= Date.now() || !['ליאור הבן', 'ליאור הבת'].includes(data.person)) return null;
    return data;
  } catch { return null; }
}

export function sameOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

export function requireAuth(req, res) {
  if (!sameOrigin(req)) { res.status(403).json({ error: 'Forbidden origin' }); return false; }
  const user = session(req);
  if (!user) { res.status(401).json({ error: 'Authentication required' }); return false; }
  req.auth = user;
  return true;
}

export function issueSession(req, res, person) {
  const payload = Buffer.from(JSON.stringify({ person, expires: Date.now() + TTL_SECONDS * 1000 })).toString('base64url');
  const secure = process.env.NODE_ENV === 'production' || req.headers?.['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${payload}.${signature(payload)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${TTL_SECONDS}${secure ? '; Secure' : ''}`);
}

export function clearSession(req, res) {
  const secure = process.env.NODE_ENV === 'production' || req.headers?.['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`);
}

export function authenticatePin(pin, req) {
  // Limit is local to a server instance. A shared limiter is required for stronger abuse protection.
  const ip = String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
  const state = attempts.get(ip) || { count: 0, until: now + 15 * 60 * 1000 };
  if (state.count >= 5) return { status: 429, retryAfter: Math.ceil((state.until - now) / 1000) };
  state.count++;
  attempts.set(ip, state);
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) return { status: 401 };
  // Production PINs live only in the deployment environment.
  if (!process.env.AUTH_PIN_BEN && !process.env.AUTH_PIN_BAT) return { status: 503 };
  const users = [
    [process.env.AUTH_PIN_BEN, 'ליאור הבן'],
    [process.env.AUTH_PIN_BAT, 'ליאור הבת']
  ].filter(([code]) => typeof code === 'string' && /^\d{4}$/.test(code));
  const user = users.find(([code]) => safeEqual(code, pin));
  if (!user) return { status: 401 };
  attempts.delete(ip);
  return { status: 200, person: user[1] };
}

export function requireCron(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || !safeEqual(req.headers?.authorization || '', `Bearer ${cronSecret}`)) {
    res.status(401).json({ error: 'Unauthorized' }); return false;
  }
  return true;
}
