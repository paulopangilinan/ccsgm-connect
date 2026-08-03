import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Sends an SMS (Semaphore, PH only) to the member who wrote a submission, when an
// elder replies. Runs server-side so the Semaphore API key is never exposed and
// so an anonymous submitter's number is never revealed to the elder.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const semaphoreKey = process.env.SEMAPHORE_API_KEY;
  const senderName = process.env.SEMAPHORE_SENDER_NAME;
  if (!supabaseUrl || !anonKey || !semaphoreKey) {
    return res.status(500).json({ error: 'Server is not configured for SMS.' });
  }

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Missing auth token.' });
  }

  const { submissionId, replyMessage, isAnonymous } = (req.body ?? {}) as {
    submissionId?: string;
    replyMessage?: string;
    isAnonymous?: boolean;
  };
  if (!submissionId || !replyMessage) {
    return res.status(400).json({ error: 'Missing submissionId or replyMessage.' });
  }

  // Act as the calling user so RLS is enforced end to end.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData } = await supabase.auth.getUser(token);
  const uid = userData?.user?.id;
  if (!uid) {
    return res.status(401).json({ error: 'Invalid session.' });
  }

  const { data: me } = await supabase.from('users').select('role, name').eq('id', uid).maybeSingle();
  if (me?.role !== 'elder') {
    return res.status(403).json({ error: 'Only elders can send notifications.' });
  }

  // Elders can read the submission + the submitter's mobile via RLS, even for
  // anonymous submissions — but this stays server-side so the elder never sees it.
  const { data: submission } = await supabase
    .from('submissions')
    .select('user_id')
    .eq('id', submissionId)
    .maybeSingle();
  if (!submission) {
    return res.status(404).json({ error: 'Submission not found.' });
  }

  const { data: member } = await supabase
    .from('users')
    .select('mobile')
    .eq('id', submission.user_id)
    .maybeSingle();
  // Semaphore wants digits only (e.g. 09171234567 or 639171234567); strip spaces,
  // dashes, and a leading "+" so a formatted number doesn't cause a bad request.
  const number = (member?.mobile ?? '').replace(/\D/g, '');
  if (!number) {
    return res.status(200).json({ sent: false, reason: 'no-mobile' });
  }

  const message = isAnonymous
    ? `An elder responded to your prayer: ${replyMessage}`
    : `Elder ${me.name} has a response to one of your prayers: ${replyMessage}`;

  const params = new URLSearchParams({ apikey: semaphoreKey, number, message });
  if (senderName) {
    params.set('sendername', senderName);
  }

  try {
    const response = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const bodyText = await response.text();
    if (!response.ok) {
      console.error('[send-sms] Semaphore error', response.status, bodyText);
      return res.status(502).json({ sent: false, error: `SMS gateway: ${bodyText}` });
    }
    console.log('[send-sms] sent to', number, bodyText);
    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error('[send-sms] gateway unreachable', err);
    return res.status(502).json({ sent: false, error: 'Could not reach the SMS gateway.' });
  }
}
