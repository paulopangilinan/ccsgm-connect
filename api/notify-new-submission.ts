import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createAdminClient, createCallerClient, getAppOrigin, getElderEmails, renderEmailHtml, resolveIsDarkForEmail, sendEmail } from './_lib/email.ts';

const TYPE_LABELS: Record<string, string> = {
  prayer_request: 'prayer request',
  counsel_request: 'counseling request',
};

// Emails all elders when a member submits a prayer or counseling request.
// Never includes the submitted text -- it stays in the app, this just points there.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Missing auth token.' });
  }

  const { submissionId } = (req.body ?? {}) as { submissionId?: string };
  if (!submissionId) {
    return res.status(400).json({ error: 'Missing submissionId.' });
  }

  const asCaller = createCallerClient(token);
  const { data: userData } = await asCaller.auth.getUser(token);
  const callerId = userData?.user?.id;
  if (!callerId) {
    return res.status(401).json({ error: 'Invalid session.' });
  }

  const { data: submission } = await asCaller
    .from('submissions')
    .select('user_id, type, is_anonymous')
    .eq('id', submissionId)
    .maybeSingle();
  if (!submission || submission.user_id !== callerId) {
    return res.status(404).json({ error: 'Submission not found.' });
  }
  if (submission.type !== 'prayer_request' && submission.type !== 'counsel_request') {
    return res.status(200).json({ sent: false, reason: 'not-applicable' });
  }

  const { data: submitter } = await asCaller
    .from('users')
    .select('name, theme_preference')
    .eq('id', callerId)
    .maybeSingle();

  const admin = createAdminClient();
  const elderEmails = await getElderEmails(admin);
  if (elderEmails.length === 0) {
    return res.status(200).json({ sent: false, reason: 'no-elders' });
  }

  const typeLabel = TYPE_LABELS[submission.type];
  const isDark = resolveIsDarkForEmail(submitter?.theme_preference as 'light' | 'dark' | 'system' | undefined);
  const origin = getAppOrigin(req);
  const who = submission.is_anonymous ? 'Someone' : (submitter?.name ?? 'A member');

  const html = renderEmailHtml({
    isDark,
    heading: `New ${typeLabel}`,
    paragraphs: [`${who} submitted a new ${typeLabel}.`, 'Open the admin panel to read and respond.'],
    ctaLabel: 'Open submissions',
    ctaUrl: `${origin}/admin/submissions`,
  });

  const { error } = await sendEmail(elderEmails, `New ${typeLabel} — CCSGM Connect`, html);
  if (error) {
    return res.status(502).json({ sent: false, error });
  }
  return res.status(200).json({ sent: true });
}
