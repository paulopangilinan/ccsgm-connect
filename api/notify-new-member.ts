import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createAdminClient, createCallerClient, getAppOrigin, getElderEmails, renderEmailHtml, resolveIsDarkForEmail, sendEmail } from './_lib/email.ts';

// Emails all elders when a new member signs up, so they know to review and
// approve/reject the account.
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
  const callerId = userData?.user?.id;
  if (!callerId) {
    return res.status(401).json({ error: 'Invalid session.' });
  }

  // The new member reports their own signup -- fetch their own row to trust
  // the name/theme rather than whatever the client sent.
  const { data: newMember } = await asCaller
    .from('users')
    .select('name, theme_preference')
    .eq('id', callerId)
    .maybeSingle();
  if (!newMember) {
    return res.status(404).json({ error: 'Profile not found.' });
  }

  const admin = createAdminClient();
  const elderEmails = await getElderEmails(admin, 'notify_new_members');
  if (elderEmails.length === 0) {
    return res.status(200).json({ sent: false, reason: 'no-elders' });
  }

  const isDark = resolveIsDarkForEmail(newMember.theme_preference as 'light' | 'dark' | 'system' | undefined);
  const origin = getAppOrigin(req);

  const html = renderEmailHtml({
    isDark,
    heading: 'A new member signed up',
    paragraphs: [
      `${newMember.name} just created an account and is awaiting approval.`,
      'Review their profile in the admin panel.',
    ],
    ctaLabel: 'Review member',
    ctaUrl: `${origin}/admin/members`,
  });

  const { error } = await sendEmail(elderEmails, 'New member awaiting approval — CCSGM Connect', html);
  if (error) {
    return res.status(502).json({ sent: false, error });
  }
  return res.status(200).json({ sent: true });
}
