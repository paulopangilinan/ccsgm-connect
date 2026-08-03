import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest } from '@vercel/node';

const BRAND = {
  brand600: '#7c3aed',
  brand700: '#6d28d9',
  accent500: '#f43f5e',
  lightBg: '#f5f3ff',
  lightCard: '#ffffff',
  lightText: '#1e1b2e',
  lightMuted: '#64748b',
  darkBg: '#120f1e',
  darkCard: '#1c1830',
  darkText: '#f1eefb',
  darkMuted: '#a1a1aa',
};

type ThemePreference = 'light' | 'dark' | 'system';

/** No way to read the recipient's actual OS preference server-side, so 'system' defaults to light. */
export function resolveIsDarkForEmail(pref: ThemePreference | null | undefined): boolean {
  return pref === 'dark';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Prefer a fixed, env-configured origin over request headers: x-forwarded-host
// is attacker-controllable by anyone who can call these endpoints directly
// (not just through the app UI), and it ends up as a link in outbound email.
// The header fallback only exists for local dev convenience.
export function getAppOrigin(req: VercelRequest): string {
  const configured = process.env.APP_ORIGIN;
  if (configured) {
    return configured.replace(/\/+$/, '');
  }
  const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.headers.host ?? 'localhost:4500';
  const protocol = host.startsWith('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

export function renderEmailHtml(options: {
  isDark: boolean;
  heading: string;
  paragraphs: string[];
  ctaLabel?: string;
  ctaUrl?: string;
}): string {
  const { isDark, heading, paragraphs, ctaLabel, ctaUrl } = options;
  const bg = isDark ? BRAND.darkBg : BRAND.lightBg;
  const card = isDark ? BRAND.darkCard : BRAND.lightCard;
  const text = isDark ? BRAND.darkText : BRAND.lightText;
  const muted = isDark ? BRAND.darkMuted : BRAND.lightMuted;
  const border = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(124,58,237,0.15)';

  // heading/paragraphs frequently interpolate user-supplied names (display
  // name has no sanitization at the source) -- escape before embedding in HTML.
  const paragraphsHtml = paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:${text};">${escapeHtml(p)}</p>`)
    .join('');

  const ctaHtml =
    ctaLabel && ctaUrl
      ? `<a href="${ctaUrl}" style="display:inline-block;margin-top:8px;padding:12px 28px;border-radius:16px;background:linear-gradient(135deg, ${BRAND.brand600}, ${BRAND.accent500});color:#ffffff;font-weight:600;font-size:14px;text-decoration:none;">${escapeHtml(ctaLabel)}</a>`
      : '';

  return `<!doctype html>
<html>
<body style="margin:0;padding:32px 16px;background:${bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:${card};border:1px solid ${border};border-radius:24px;padding:32px;">
    <tr><td>
      <p style="margin:0 0 4px;font-size:13px;font-weight:800;letter-spacing:0.02em;color:${BRAND.brand600};">CCSGM CONNECT</p>
      <h1 style="margin:0 0 20px;font-size:20px;font-weight:800;color:${text};">${escapeHtml(heading)}</h1>
      ${paragraphsHtml}
      ${ctaHtml}
      <p style="margin:28px 0 0;font-size:12px;color:${muted};">This is an automated message from CCSGM Connect.</p>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendEmail(to: string | string[], subject: string, html: string): Promise<{ error: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!apiKey || !from) {
    return { error: 'Email is not configured on the server.' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    });
    if (!response.ok) {
      const bodyText = await response.text();
      console.error('[email] Resend error', response.status, bodyText);
      return { error: `Email gateway: ${bodyText}` };
    }
    return { error: null };
  } catch (err) {
    console.error('[email] gateway unreachable', err);
    return { error: 'Could not reach the email gateway.' };
  }
}

export function createAdminClient(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function createCallerClient(token: string): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Elder emails live in auth.users, not readable via the normal client -- looked up through the Admin API. */
export async function getElderEmails(admin: SupabaseClient): Promise<string[]> {
  const { data: elders } = await admin.from('users').select('id').eq('role', 'elder');
  if (!elders || elders.length === 0) {
    return [];
  }

  const emails = await Promise.all(
    elders.map(async (row) => {
      const { data } = await admin.auth.admin.getUserById(row['id'] as string);
      return data?.user?.email ?? null;
    }),
  );
  return emails.filter((email): email is string => !!email);
}
