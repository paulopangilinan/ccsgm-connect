import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createAdminClient, createCallerClient } from './_lib/email.ts';

// Pushes an elder-approved testimony to ccsgm-website, where it lands as a
// pending Sanity draft in the "Share Your Story" review queue. Called by an
// elder's browser right after they approve a testimony in admin/testimonies
// (and again if they hit "Retry sync" after a failure). Every field sent to
// the website is re-fetched here server-side via the service-role client --
// the client only supplies which testimony to publish, never its content.
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

  // Everything below used to run unguarded -- any unexpected throw (a bad
  // Supabase client config, a network blip, etc.) crashed the whole Lambda
  // and Vercel showed its own generic error page instead of a diagnosable
  // JSON body. Wrapping the whole thing means a failure always comes back
  // as { error: <real message> }, visible in admin/testimonies.
  try {
    const asCaller = createCallerClient(token);
    const { data: userData } = await asCaller.auth.getUser(token);
    const callerId = userData?.user?.id;
    if (!callerId) {
      return res.status(401).json({ error: 'Invalid session.' });
    }

    const { data: caller } = await asCaller.from('users').select('role').eq('id', callerId).maybeSingle();
    if (caller?.role !== 'elder') {
      return res.status(403).json({ error: 'Elders only.' });
    }

    const admin = createAdminClient();

    const { data: testimony } = await admin
      .from('testimonies')
      .select('id, user_id, body, is_anonymous, share_to_website, website_review_status, linked_prayer_id')
      .eq('id', testimonyId)
      .maybeSingle();
    if (!testimony) {
      return res.status(404).json({ error: 'Testimony not found.' });
    }
    if (!testimony.share_to_website || testimony.website_review_status !== 'approved') {
      return res.status(409).json({ error: 'Testimony is not approved for the website.' });
    }

    const { data: media } = await admin.from('testimony_media').select('url').eq('testimony_id', testimonyId);
    const { data: submitter } = await admin
      .from('users')
      .select('name, gender, church')
      .eq('id', testimony.user_id)
      .maybeSingle();

    let linkedPrayerBody: string | null = null;
    if (testimony.linked_prayer_id) {
      const { data: prayer } = await admin
        .from('submissions')
        .select('body')
        .eq('id', testimony.linked_prayer_id)
        .maybeSingle();
      linkedPrayerBody = prayer?.body ?? null;
    }

    const church = submitter?.church ?? 'CCSGM Kawit';
    // Anonymous format is only ever used here, when is_anonymous is true --
    // a named testimony's author is simply the member's own name.
    const author = testimony.is_anonymous
      ? `A ${submitter?.gender === 'male' ? 'brother' : 'sister'} from ${church}`
      : (submitter?.name ?? 'A member');

    const websiteUrl = process.env.WEBSITE_API_URL;
    const secret = process.env.WEBSITE_SYNC_SECRET;
    if (!websiteUrl || !secret) {
      const message = 'Website sync is not configured on the server.';
      await admin
        .from('testimonies')
        .update({ website_sync_status: 'failed', website_sync_error: message })
        .eq('id', testimonyId);
      return res.status(500).json({ error: message });
    }

    const response = await fetch(`${websiteUrl.replace(/\/+$/, '')}/api/testimony-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ccsgm-sync-secret': secret },
      body: JSON.stringify({
        sourceId: testimonyId,
        author,
        isAnonymous: testimony.is_anonymous,
        church,
        testimonyBody: testimony.body,
        linkedPrayerBody,
        images: (media ?? []).map((m) => m.url),
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { postId?: string; error?: string };

    if (!response.ok || !data.postId) {
      const message = data.error ?? `Website responded with ${response.status}`;
      await admin
        .from('testimonies')
        .update({ website_sync_status: 'failed', website_sync_error: message })
        .eq('id', testimonyId);
      return res.status(502).json({ error: message });
    }

    await admin
      .from('testimonies')
      .update({
        website_sync_status: 'synced',
        website_post_id: data.postId,
        website_sync_error: null,
        website_synced_at: new Date().toISOString(),
      })
      .eq('id', testimonyId);
    return res.status(200).json({ ok: true, postId: data.postId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected server error.';
    console.error('[publish-testimony-to-website] unhandled error', err);
    try {
      const admin = createAdminClient();
      await admin
        .from('testimonies')
        .update({ website_sync_status: 'failed', website_sync_error: message })
        .eq('id', testimonyId);
    } catch {
      // Best-effort -- the JSON error response below still gets returned
      // even if this couldn't persist (e.g. createAdminClient itself failed).
    }
    return res.status(500).json({ error: message });
  }
}
