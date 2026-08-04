export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }
  
  const publicKey = process.env.VAPID_PUBLIC_KEY || 'BD9KxWbC7ZkF4Pz7j_x-3f8nJgV1E2HwUa5R0L_8vQcT4bM5X7N8cE9rQ5U9bT1K4Y2t_L5bM1W8zF0vK6A';
  
  res.status(200).json({ publicKey });
}
