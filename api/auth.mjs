import { authenticatePin, clearSession, issueSession, sameOrigin, session } from './_lib/auth.mjs';
import { bodyObject } from './_lib/validation.mjs';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!sameOrigin(req)) return res.status(403).json({ error: 'Forbidden origin' });
  if (req.method === 'GET') {
    const user = session(req);
    return res.status(200).json({ authenticated: Boolean(user), ...(user ? { person: user.person } : {}) });
  }
  if (req.method === 'DELETE') {
    clearSession(req, res);
    return res.status(200).json({ authenticated: false });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { pin } = bodyObject(req.body);
    const result = authenticatePin(pin, req);
    if (result.status === 429) res.setHeader('Retry-After', result.retryAfter);
    if (result.status !== 200) return res.status(result.status).json({ error: result.status === 429 ? 'Too many attempts; try again later' : result.status === 503 ? 'Authentication is not configured' : 'Invalid PIN' });
    issueSession(req, res, result.person);
    return res.status(200).json({ authenticated: true, person: result.person });
  } catch (error) {
    return res.status(error.status || 503).json({ error: error.status ? error.message : 'Authentication unavailable' });
  }
}
