import { requireAuth } from './_lib/auth.mjs';
export default function handler(req, res) {
  if (!requireAuth(req, res)) return;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }
  
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return res.status(503).json({ error: 'Push notifications are not configured' });
  return res.status(200).json({ publicKey });
}
