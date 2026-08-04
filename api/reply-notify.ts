import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createAdminClient, createCallerClient, getAppOrigin, renderEmailHtml, resolveIsDarkForEmail, sendEmail } from './_lib/email.ts';

const TYPE_LABELS: Record<string, string> = {
  prayer_request: 'prayer request',
  counsel_request: 'counseling request',
};

// Emails the submitter when an elder replies. Never includes the reply text in
// the notification -- prayers/counsel stay in the app, this just points there.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Missing auth token.' });
  }

  const { submissionId, isAnonymous } = (req.body ?? {}) as { submissionId?: string; isAnonymous?: boolean };
  if (!submissionId) {
    return res.status(400).json({ error: 'Missing submissionId.' });
  }

  const asCaller = createCallerClient(token);
  const { data: userData } = await asCaller.auth.getUser(token);
  const callerId = userData?.user?.id;
  if (!callerId) {
    return res.status(401).json({ error: 'Invalid session.' });
  }

  const { data: me } = await asCaller.from('users').select('role, name').eq('id', callerId).maybeSingle();
  if (me?.role !== 'elder') {
    return res.status(403).json({ error: 'Only elders can trigger this.' });
  }

  const { data: submission } = await asCaller
    .from('submissions')
    .select('user_id, type')
    .eq('id', submissionId)
    .maybeSingle();
  if (!submission) {
    return res.status(404).json({ error: 'Submission not found.' });
  }

  // Guard against triggering a "you have a new response" email with nothing
  // behind it -- confirm a response row actually exists for this submission.
  const { data: response } = await asCaller
    .from('submission_responses')
    .select('id')
    .eq('submission_id', submissionId)
    .limit(1)
    .maybeSingle();
  if (!response) {
    return res.status(404).json({ error: 'No response found for this submission.' });
  }

  const { data: member } = await asCaller
    .from('users')
    .select('theme_preference')
    .eq('id', submission.user_id)
    .maybeSingle();

  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(submission.user_id as string);
  const memberEmail = authUser?.user?.email;
  if (!memberEmail) {
    return res.status(200).json({ sent: false, reason: 'no-email' });
  }

  const typeLabel = TYPE_LABELS[submission.type as string] ?? 'submission';
  const isDark = resolveIsDarkForEmail(member?.theme_preference as 'light' | 'dark' | 'system' | undefined);
  const origin = getAppOrigin(req);
  const targetPath = submission.type === 'counsel_request' ? '/dashboard/counseling' : '/dashboard/prayers';

  const html = renderEmailHtml({
    isDark,
    heading: 'You have a new response',
    paragraphs: [
      isAnonymous
        ? `An elder responded to your ${typeLabel}.`
        : `Elder ${me.name} responded to your ${typeLabel}.`,
      'Open the app to read it.',
    ],
    ctaLabel: 'View response',
    ctaUrl: `${origin}${targetPath}`,
  });

  const { error } = await sendEmail(memberEmail, 'You have a new response — CCSGM Connect', html);
  if (error) {
    return res.status(502).json({ sent: false, error });
  }
  return res.status(200).json({ sent: true });
}
