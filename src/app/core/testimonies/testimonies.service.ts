import { Service, inject } from '@angular/core';
import { SupabaseClientService } from '../supabase/supabase-client';
import { SessionService } from '../auth/session.service';
import { AdminTestimony, NewTestimony, Testimony, WebsiteReviewStatus } from './testimony';

interface ActionResult {
  error: string | null;
}

@Service()
export class TestimoniesService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly session = inject(SessionService);

  async listMine(): Promise<Testimony[]> {
    const userId = this.session.session()?.user.id;
    if (!userId) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('testimonies')
      .select(
        'id, linked_prayer_id, body, is_anonymous, share_to_website, created_at, website_review_status, website_review_note, website_sync_status, testimony_media(url)',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      id: row['id'] as string,
      linkedPrayerId: row['linked_prayer_id'] as string | null,
      body: row['body'] as string,
      isAnonymous: row['is_anonymous'] as boolean,
      shareToWebsite: row['share_to_website'] as boolean,
      createdAt: row['created_at'] as string,
      mediaUrls: ((row['testimony_media'] as { url: string }[] | null) ?? []).map((m) => m.url),
      websiteReviewStatus: row['website_review_status'] as Testimony['websiteReviewStatus'],
      websiteReviewNote: row['website_review_note'] as string | null,
      websiteSyncStatus: row['website_sync_status'] as Testimony['websiteSyncStatus'],
    }));
  }

  // Elder-only view of every testimony a member has opted to share publicly,
  // joined with the submitter's profile and the linked prayer (if any) so the
  // review screen at admin/testimonies has everything it needs in one call.
  // Readable under the existing "testimonies readable by owner and elders"
  // policy (is_elder()) -- no new SELECT policy required.
  async listForAdmin(): Promise<AdminTestimony[]> {
    const { data, error } = await this.supabase
      .from('testimonies')
      .select(
        `id, user_id, body, is_anonymous, created_at, linked_prayer_id,
         website_review_status, website_review_note, website_sync_status,
         website_post_id, website_sync_error, website_synced_at,
         testimony_media(url),
         users!testimonies_user_id_fkey(name, gender, church, avatar_url),
         linked_prayer:submissions(body)`,
      )
      .eq('share_to_website', true)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((row) => {
      // users/linked_prayer are many-to-one embeds (each testimony has at
      // most one submitter and one linked prayer), so PostgREST returns a
      // single object here at runtime -- unlike testimony_media below, which
      // is a genuine one-to-many array. The generic (untyped) client can't
      // express that distinction, so it types every embed as an array; cast
      // through `unknown` to match what's actually on the wire.
      const submitter = row['users'] as unknown as
        | { name: string; gender: AdminTestimony['submitterGender']; church: string | null; avatar_url: string | null }
        | null;
      const linkedPrayer = row['linked_prayer'] as unknown as { body: string } | null;
      return {
        id: row['id'] as string,
        userId: row['user_id'] as string,
        body: row['body'] as string,
        isAnonymous: row['is_anonymous'] as boolean,
        createdAt: row['created_at'] as string,
        mediaUrls: ((row['testimony_media'] as { url: string }[] | null) ?? []).map((m) => m.url),
        linkedPrayerId: row['linked_prayer_id'] as string | null,
        linkedPrayerBody: linkedPrayer?.body ?? null,
        submitterName: submitter?.name ?? 'A member',
        submitterGender: submitter?.gender ?? null,
        submitterChurch: submitter?.church ?? 'CCSGM Kawit',
        submitterAvatarUrl: submitter?.avatar_url ?? null,
        websiteReviewStatus: row['website_review_status'] as AdminTestimony['websiteReviewStatus'],
        websiteReviewNote: row['website_review_note'] as string | null,
        websiteSyncStatus: row['website_sync_status'] as AdminTestimony['websiteSyncStatus'],
        websitePostId: row['website_post_id'] as string | null,
        websiteSyncError: row['website_sync_error'] as string | null,
        websiteSyncedAt: row['website_synced_at'] as string | null,
      };
    });
  }

  async setReviewStatus(
    testimonyId: string,
    status: Extract<WebsiteReviewStatus, 'approved' | 'rejected'>,
    note?: string,
  ): Promise<ActionResult> {
    const elderId = this.session.session()?.user.id;
    const { error } = await this.supabase
      .from('testimonies')
      .update({
        website_review_status: status,
        website_review_note: note ?? null,
        website_reviewed_by: elderId ?? null,
        website_reviewed_at: new Date().toISOString(),
      })
      .eq('id', testimonyId);
    return { error: error?.message ?? null };
  }

  // Calls the ccsgm-connect Vercel function that pushes an approved testimony
  // to ccsgm-website as a pending Sanity draft. Safe to call again after a
  // failure -- the website side is idempotent on the testimony's id.
  async publishToWebsite(testimonyId: string): Promise<ActionResult> {
    const token = this.session.session()?.access_token;
    if (!token) {
      return { error: 'Not signed in' };
    }

    try {
      const response = await fetch('/api/publish-testimony-to-website', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ testimonyId }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        return { error: data.error ?? `Failed to sync to website (${response.status})` };
      }
      return { error: null };
    } catch {
      return { error: 'Could not reach the server.' };
    }
  }

  async create(input: NewTestimony): Promise<ActionResult & { mediaWarning?: string }> {
    const userId = this.session.session()?.user.id;
    if (!userId) {
      return { error: 'Not signed in' };
    }

    const { data, error } = await this.supabase
      .from('testimonies')
      .insert({
        user_id: userId,
        linked_prayer_id: input.linkedPrayerId,
        body: input.body,
        is_anonymous: input.isAnonymous,
        share_to_website: input.shareToWebsite,
        website_review_status: input.shareToWebsite ? 'pending' : null,
      })
      .select('id')
      .single();

    if (error || !data) {
      return { error: error?.message ?? 'Failed to save testimony' };
    }

    const testimonyId = data['id'] as string;

    // From here on, failures are non-fatal: the testimony row already
    // exists, so returning an error would make the caller think nothing was
    // saved and retry -- creating a duplicate testimony with the same text.
    // A failed photo is just dropped and reported back via mediaWarning.
    let mediaWarning: string | undefined;
    const urls: string[] = [];
    for (const [index, image] of input.images.entries()) {
      const path = `${userId}/${testimonyId}/${index}`;
      const { error: uploadError } = await this.supabase.storage
        .from('testimony-media')
        .upload(path, image, { upsert: true, contentType: image.type || 'image/jpeg' });
      if (uploadError) {
        mediaWarning = 'Saved, but one or more photos failed to upload.';
        continue;
      }
      const { data: publicUrl } = this.supabase.storage.from('testimony-media').getPublicUrl(path);
      urls.push(publicUrl.publicUrl);
    }

    if (urls.length > 0) {
      const { error: mediaError } = await this.supabase
        .from('testimony_media')
        .insert(urls.map((url) => ({ testimony_id: testimonyId, url })));
      if (mediaError) {
        mediaWarning = 'Saved, but photos failed to attach.';
      }
    }

    if (input.shareToWebsite) {
      // Fire-and-forget: elders get emailed, but this never blocks or fails the submission itself.
      void this.notifyNewTestimony(testimonyId);
    }

    return { error: null, mediaWarning };
  }

  private async notifyNewTestimony(testimonyId: string): Promise<void> {
    const token = this.session.session()?.access_token;
    if (!token) {
      return;
    }
    try {
      await fetch('/api/notify-new-testimony', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ testimonyId }),
      });
    } catch {
      // Non-fatal -- the submission already succeeded.
    }
  }
}
