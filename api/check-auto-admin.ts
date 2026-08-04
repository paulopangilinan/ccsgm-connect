import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createAdminClient, createCallerClient } from './_lib/email.ts';

// Auto-promotes a brand-new sign-up to elder+approved if their (verified,
// token-derived) email is in AUTO_ADMIN. Runs server-side with the
// service-role key so the promotion can't be spoofed from the client --
// the email checked is the one Supabase's own auth session says it is, not
// anything the request body could claim.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Missing auth token.' });
  }

  const asCaller = createCallerClient(token);
  const { data: userData } = await asCaller.auth.getUser(token);
  const user = userData?.user;
  if (!user?.id || !user.email) {
    return res.status(401).json({ error: 'Invalid session.' });
  }

  const autoAdminList = (process.env.AUTO_ADMIN ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);

  const isAutoAdmin = autoAdminList.includes(user.email.toLowerCase());
  if (!isAutoAdmin) {
    return res.status(200).json({ promoted: false });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('users')
    .update({ role: 'elder', membership_status: 'approved' })
    .eq('id', user.id);

  if (error) {
    return res.status(502).json({ promoted: false, error: error.message });
  }
  return res.status(200).json({ promoted: true });
}
