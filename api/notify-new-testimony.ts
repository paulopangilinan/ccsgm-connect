import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createAdminClient, createCallerClient, getAppOrigin, getElderEmails, renderEmailHtml, resolveIsDarkForEmail, sendEmail } from './_lib/email.ts';

// Emails elders (who haven't opted out) when a member shares a testimony for
// the website, so they know it's waiting in admin/testimonies. Never includes
// the testimony text itself -- it stays in the app, this just points there.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Missing auth token.' });
  }

  const { testimonyId } = (req.body ?? {}) as { testimonyId?: string };
  if (!testimonyId) {
    return res.status(400).json({ error: 'Missing testimonyId.' });
  }

  const asCaller = createCallerClient(token);
  const { data: userData } = await asCaller.auth.getUser(token);
  const callerId = userData?.user?.id;
  if (!callerId) {
    return res.status(401).json({ error: 'Invalid session.' });
  }

  const { data: testimony } = await asCaller
    .from('testimonies')
    .select('user_id, is_anonymous, share_to_website')
    .eq('id', testimonyId)
    .maybeSingle();
  if (!testimony || testimony.user_id !== callerId) {
    return res.status(404).json({ error: 'Testimony not found.' });
  }
  if (!testimony.share_to_website) {
    return res.status(200).json({ sent: false, reason: 'not-applicable' });
  }

  const { data: submitter } = await asCaller
    .from('users')
    .select('name, theme_preference')
    .eq('id', callerId)
    .maybeSingle();

  const admin = createAdminClient();
  const elderEmails = await getElderEmails(admin, 'notify_new_testimonies');
  if (elderEmails.length === 0) {
    return res.status(200).json({ sent: false, reason: 'no-elders' });
  }

  const isDark = resolveIsDarkForEmail(submitter?.theme_preference as 'light' | 'dark' | 'system' | undefined);
  const origin = getAppOrigin(req);
  const who = testimony.is_anonymous ? 'Someone' : (submitter?.name ?? 'A member');

  const html = renderEmailHtml({
    isDark,
    heading: 'New testimony shared',
    paragraphs: [`${who} shared a testimony for the CCSGM website.`, 'Review it in the admin panel.'],
    ctaLabel: 'Open testimonies',
    ctaUrl: `${origin}/admin/testimonies`,
  });

  const { error } = await sendEmail(elderEmails, 'New testimony shared — CCSGM Connect', html);
  if (error) {
    return res.status(502).json({ sent: false, error });
  }
  return res.status(200).json({ sent: true });
}
