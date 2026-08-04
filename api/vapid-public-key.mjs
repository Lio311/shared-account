export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).send('Method Not Allowed');
  }
  
  const publicKey = process.env.VAPID_PUBLIC_KEY || 'BME9LOdF8qbwYFriwt6h70i0vzcv5YjCbJy0_RvE4OIDt2CE32SX-8hoIjLVFl_LmTPH9yOitw-S8Hz0gkZqa-s';
  
  res.status(200).json({ publicKey });
}
