import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(req: VercelRequest, res: VercelResponse) {
  res.status(200).json({
    ok: true,
    service: 'ccsgm-connect-api',
    timestamp: new Date().toISOString(),
  });
}
