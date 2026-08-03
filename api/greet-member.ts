import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createAdminClient, createCallerClient, getAppOrigin, renderEmailHtml, resolveIsDarkForEmail, sendEmail } from './_lib/email.ts';

const BIRTHDAY_LINE = "Wishing you a wonderful day full of joy and God's blessings, from your CCSGM family. 🎉";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Missing auth token.' });
  }

  const { memberId, channel } = (req.body ?? {}) as { memberId?: string; channel?: 'email' | 'sms' };
  if (!memberId || (channel !== 'email' && channel !== 'sms')) {
    return res.status(400).json({ error: 'Missing memberId or channel.' });
  }

  const asCaller = createCallerClient(token);
  const { data: userData } = await asCaller.auth.getUser(token);
  const callerId = userData?.user?.id;
  if (!callerId) {
    return res.status(401).json({ error: 'Invalid session.' });
  }

  const { data: me } = await asCaller.from('users').select('role, name, theme_preference').eq('id', callerId).maybeSingle();
  if (me?.role !== 'elder') {
    return res.status(403).json({ error: 'Only elders can send greetings.' });
  }

  const { data: member } = await asCaller.from('users').select('name, mobile').eq('id', memberId).maybeSingle();
  if (!member) {
    return res.status(404).json({ error: 'Member not found.' });
  }

  if (channel === 'sms') {
    const semaphoreKey = process.env.SEMAPHORE_API_KEY;
    const senderName = process.env.SEMAPHORE_SENDER_NAME;
    if (!semaphoreKey) {
      return res.status(500).json({ error: 'SMS is not configured on the server.' });
    }

    const number = (member.mobile as string | null ?? '').replace(/\D/g, '');
    if (!number) {
      return res.status(200).json({ sent: false, reason: 'no-mobile' });
    }

    const params = new URLSearchParams({
      apikey: semaphoreKey,
      number,
      message: `Happy birthday, ${member.name}! ${BIRTHDAY_LINE}`,
    });
    if (senderName) {
      params.set('sendername', senderName);
    }

    const response = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!response.ok) {
      const bodyText = await response.text();
      return res.status(502).json({ sent: false, error: `SMS gateway: ${bodyText}` });
    }
    return res.status(200).json({ sent: true });
  }

  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(memberId);
  const email = authUser?.user?.email;
  if (!email) {
    return res.status(200).json({ sent: false, reason: 'no-email' });
  }

  const isDark = resolveIsDarkForEmail(me.theme_preference as 'light' | 'dark' | 'system' | undefined);
  const html = renderEmailHtml({
    isDark,
    heading: `Happy Birthday, ${member.name as string}! 🎉`,
    paragraphs: [BIRTHDAY_LINE, `With love, ${me.name} and your CCSGM family.`],
    ctaLabel: 'Open CCSGM Connect',
    ctaUrl: getAppOrigin(req),
  });

  const { error } = await sendEmail(email, `Happy Birthday, ${member.name as string}! 🎉`, html);
  if (error) {
    return res.status(502).json({ sent: false, error });
  }
  return res.status(200).json({ sent: true });
}
