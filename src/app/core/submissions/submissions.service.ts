import { Service, inject } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseClientService } from '../supabase/supabase-client';
import { SessionService } from '../auth/session.service';
import { AdminSubmission, MySubmission, SubmissionResponse, SubmissionType } from './submission';

interface ActionResult {
  error: string | null;
}

@Service()
export class SubmissionsService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly session = inject(SessionService);

  async create(
    type: SubmissionType,
    body: string,
    isAnonymous: boolean,
    images: File[] = [],
  ): Promise<ActionResult & { mediaWarning?: string }> {
    const userId = this.session.session()?.user.id;
    if (!userId) {
      return { error: 'Not signed in' };
    }

    const { data, error } = await this.supabase
      .from('submissions')
      .insert({ user_id: userId, type, body, is_anonymous: isAnonymous })
      .select('id')
      .single();

    if (error || !data) {
      return { error: error?.message ?? 'Failed to save submission' };
    }

    const submissionId = data['id'] as string;

    // From here on, failures are non-fatal: the submission row already
    // exists, so returning an error would make the caller think nothing was
    // saved and retry -- creating a duplicate submission with the same text.
    // A failed photo is just dropped and reported back via mediaWarning.
    let mediaWarning: string | undefined;
    const urls: string[] = [];
    for (const [index, image] of images.entries()) {
      const path = `${userId}/${submissionId}/${index}`;
      const { error: uploadError } = await this.supabase.storage
        .from('submission-media')
        .upload(path, image, { upsert: true, contentType: image.type || 'image/jpeg' });
      if (uploadError) {
        mediaWarning = 'Saved, but one or more photos failed to upload.';
        continue;
      }
      const { data: publicUrl } = this.supabase.storage.from('submission-media').getPublicUrl(path);
      urls.push(publicUrl.publicUrl);
    }

    if (urls.length > 0) {
      const { error: mediaError } = await this.supabase
        .from('submission_media')
        .insert(urls.map((url) => ({ submission_id: submissionId, url })));
      if (mediaError) {
        mediaWarning = 'Saved, but photos failed to attach.';
      }
    }

    if (type === 'prayer_request' || type === 'counsel_request') {
      // Fire-and-forget: elders get emailed, but this never blocks or fails the submission itself.
      void this.notifyNewSubmission(submissionId);
    }

    return { error: null, mediaWarning };
  }

  private async notifyNewSubmission(submissionId: string): Promise<void> {
    const token = this.session.session()?.access_token;
    if (!token) {
      return;
    }
    try {
      await fetch('/api/notify-new-submission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ submissionId }),
      });
    } catch {
      // Non-fatal -- the submission already succeeded.
    }
  }

  async listMine(): Promise<MySubmission[]> {
    const userId = this.session.session()?.user.id;
    if (!userId) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('submissions')
      .select('id, type, body, is_anonymous, is_answered, created_at, submission_media(url)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      id: row['id'] as string,
      type: row['type'] as MySubmission['type'],
      body: row['body'] as string,
      isAnonymous: row['is_anonymous'] as boolean,
      isAnswered: row['is_answered'] as boolean,
      createdAt: row['created_at'] as string,
      mediaUrls: ((row['submission_media'] as { url: string }[] | null) ?? []).map((m) => m.url),
    }));
  }

  async markPrayerAnswered(submissionId: string, answered: boolean): Promise<ActionResult> {
    const { error } = await this.supabase
      .from('submissions')
      .update({ is_answered: answered })
      .eq('id', submissionId);
    return { error: error?.message ?? null };
  }

  async listForAdmin(type: SubmissionType): Promise<AdminSubmission[]> {
    const { data, error } = await this.supabase
      .from('submissions_admin')
      .select('id, type, body, is_anonymous, created_at, submitted_by, submitted_by_avatar')
      .eq('type', type)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    // submissions_admin is a view, so PostgREST can't auto-embed
    // submission_media the way listMine() embeds it on the base table --
    // fetched separately and merged by id instead.
    const ids = data.map((row) => row['id'] as string);
    const mediaBySubmission = new Map<string, string[]>();
    if (ids.length > 0) {
      const { data: media } = await this.supabase
        .from('submission_media')
        .select('submission_id, url')
        .in('submission_id', ids);
      for (const row of media ?? []) {
        const submissionId = row['submission_id'] as string;
        const list = mediaBySubmission.get(submissionId) ?? [];
        list.push(row['url'] as string);
        mediaBySubmission.set(submissionId, list);
      }
    }

    return data.map((row) => ({
      id: row['id'] as string,
      type: row['type'] as AdminSubmission['type'],
      body: row['body'] as string,
      isAnonymous: row['is_anonymous'] as boolean,
      createdAt: row['created_at'] as string,
      submittedBy: row['submitted_by'] as string | null,
      submittedByAvatar: row['submitted_by_avatar'] as string | null,
      mediaUrls: mediaBySubmission.get(row['id'] as string) ?? [],
    }));
  }

  // Live-pushes new replies (RLS still applies -- a member only receives
  // INSERTs for responses on their own submissions, elders receive all of
  // them) so reply threads update without a manual reload. Returns an
  // unsubscribe function; callers should invoke it on component destroy.
  //
  // Note on responder_id: postgres_changes streams the raw base-table row --
  // RLS is row-level only, it can't null out a single column the way the
  // submission_responses_visible view does for listResponses() below. We
  // redact it here too so the normal app UI never displays/stores it, but
  // that's best-effort: the un-redacted value still crosses the wire in the
  // realtime payload, so this alone doesn't stop someone inspecting the raw
  // socket frame. listResponses() via the view is the actually-enforced path.
  subscribeToResponses(onInsert: (response: SubmissionResponse) => void): () => void {
    const channel: RealtimeChannel = this.supabase
      .channel(`submission-responses-${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'submission_responses' },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const isAnonymous = row['is_anonymous'] as boolean;
          const shouldRedact = isAnonymous && !this.session.isElder();
          onInsert({
            id: row['id'] as string,
            submissionId: row['submission_id'] as string,
            responderId: shouldRedact ? null : (row['responder_id'] as string),
            body: row['body'] as string,
            createdAt: row['created_at'] as string,
            responderName: row['responder_name'] as string | null,
            responderAvatarUrl: row['responder_avatar_url'] as string | null,
          });
        },
      )
      .subscribe();

    return () => void this.supabase.removeChannel(channel);
  }

  async listResponses(submissionIds: string[]): Promise<SubmissionResponse[]> {
    if (submissionIds.length === 0) {
      return [];
    }

    // Via the view, not the base table: it nulls responder_id for anonymous
    // rows unless the viewer is an elder (see submission_responses_visible).
    const { data, error } = await this.supabase
      .from('submission_responses_visible')
      .select('id, submission_id, responder_id, body, created_at, responder_name, responder_avatar_url')
      .in('submission_id', submissionIds)
      .order('created_at', { ascending: true });

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      id: row['id'] as string,
      submissionId: row['submission_id'] as string,
      responderId: row['responder_id'] as string | null,
      body: row['body'] as string,
      createdAt: row['created_at'] as string,
      // Denormalized on the row (null when the elder replied anonymously).
      responderName: row['responder_name'] as string | null,
      responderAvatarUrl: row['responder_avatar_url'] as string | null,
    }));
  }

  async respond(
    submissionId: string,
    body: string,
    isAnonymous: boolean,
  ): Promise<{ response: SubmissionResponse | null } & ActionResult> {
    const responderId = this.session.session()?.user.id;
    if (!responderId) {
      return { response: null, error: 'Not signed in' };
    }

    const profile = this.session.profile();
    const responderName = isAnonymous ? null : (profile?.name ?? null);
    const responderAvatarUrl = isAnonymous ? null : (profile?.avatarUrl ?? null);
    const { data, error } = await this.supabase
      .from('submission_responses')
      .insert({
        submission_id: submissionId,
        responder_id: responderId,
        body,
        is_anonymous: isAnonymous,
        responder_name: responderName,
        responder_avatar_url: responderAvatarUrl,
      })
      .select('id, submission_id, body, created_at')
      .single();

    if (error || !data) {
      return { response: null, error: error?.message ?? 'Failed to send reply' };
    }

    if (this.session.isElder()) {
      // Fire-and-forget: the member gets emailed, but this never blocks or fails the reply itself.
      // Skipped when a member replies to their own thread -- there's no one to notify.
      void this.notifyReply(submissionId, isAnonymous);
    }

    return {
      error: null,
      response: {
        id: data['id'] as string,
        submissionId: data['submission_id'] as string,
        responderId,
        body: data['body'] as string,
        createdAt: data['created_at'] as string,
        responderName,
        responderAvatarUrl,
      },
    };
  }

  private async notifyReply(submissionId: string, isAnonymous: boolean): Promise<void> {
    const token = this.session.session()?.access_token;
    if (!token) {
      return;
    }
    try {
      await fetch('/api/reply-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ submissionId, isAnonymous }),
      });
    } catch {
      // Non-fatal -- the reply already succeeded.
    }
  }

  // Fire an SMS to the submitter via the server (Semaphore). Returns a soft
  // result: the reply itself already succeeded, so SMS failure isn't fatal.
  async sendReplySms(
    submissionId: string,
    replyMessage: string,
    isAnonymous: boolean,
  ): Promise<{ sent: boolean; error: string | null }> {
    const token = this.session.session()?.access_token;
    if (!token) {
      return { sent: false, error: 'Not signed in' };
    }

    try {
      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ submissionId, replyMessage, isAnonymous }),
      });
      const data = (await response.json().catch(() => ({}))) as { sent?: boolean; reason?: string; error?: string };
      if (!response.ok) {
        return { sent: false, error: data.error ?? `SMS failed (${response.status})` };
      }
      if (!data.sent) {
        return { sent: false, error: data.reason === 'no-mobile' ? 'Member has no mobile number on file' : (data.error ?? 'SMS not sent') };
      }
      return { sent: true, error: null };
    } catch {
      return { sent: false, error: 'Could not reach the SMS service' };
    }
  }
}
