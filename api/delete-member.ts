import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Permanently deletes a member's account (auth.users row + everything that
// cascades from it: profile, submissions, testimonies, question answers).
// Requires the service_role key, so this must run server-side -- never in
// the browser bundle.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server is not configured for member deletion.' });
  }

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Missing auth token.' });
  }

  const { memberId } = (req.body ?? {}) as { memberId?: string };
  if (!memberId) {
    return res.status(400).json({ error: 'Missing memberId.' });
  }

  // Act as the calling user first, so role checks go through RLS as normal.
  const asCaller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData } = await asCaller.auth.getUser(token);
  const callerId = userData?.user?.id;
  if (!callerId) {
    return res.status(401).json({ error: 'Invalid session.' });
  }

  const { data: caller } = await asCaller.from('users').select('role').eq('id', callerId).maybeSingle();
  if (caller?.role !== 'elder') {
    return res.status(403).json({ error: 'Only elders can delete members.' });
  }

  if (memberId === callerId) {
    return res.status(400).json({ error: "You can't delete your own account here." });
  }

  const { data: target } = await asCaller.from('users').select('role').eq('id', memberId).maybeSingle();
  if (!target) {
    return res.status(404).json({ error: 'Member not found.' });
  }
  if (target.role === 'elder') {
    return res.status(400).json({ error: "Elder accounts can't be deleted from this screen." });
  }

  // Only now switch to the service-role (admin) client, and only to run the
  // one privileged operation this endpoint exists for.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await admin.auth.admin.deleteUser(memberId);
  if (error) {
    return res.status(502).json({ error: error.message });
  }

  return res.status(200).json({ deleted: true });
}
