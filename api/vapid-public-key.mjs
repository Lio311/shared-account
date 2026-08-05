export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }
  
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BIM0xAWO_Q74HlZtHNUhyQIv94Lf3OX3XjMXO8c7sRuJVdgmwc874tsNgjsYuWByrICnC_0PS0GJN-rP0w1uiCg';
  
  res.status(200).json({ publicKey });
}
