import { Service, inject } from '@angular/core';
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

  async create(type: SubmissionType, body: string, isAnonymous: boolean): Promise<ActionResult> {
    const userId = this.session.session()?.user.id;
    if (!userId) {
      return { error: 'Not signed in' };
    }

    const { error } = await this.supabase
      .from('submissions')
      .insert({ user_id: userId, type, body, is_anonymous: isAnonymous });

    return { error: error?.message ?? null };
  }

  async listMine(): Promise<MySubmission[]> {
    const userId = this.session.session()?.user.id;
    if (!userId) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('submissions')
      .select('id, type, body, is_anonymous, is_answered, created_at')
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
    }));
  }

  async markPrayerAnswered(submissionId: string, answered: boolean): Promise<ActionResult> {
    const { error } = await this.supabase
      .from('submissions')
      .update({ is_answered: answered })
      .eq('id', submissionId);
    return { error: error?.message ?? null };
  }

  async listForAdmin(): Promise<AdminSubmission[]> {
    const { data, error } = await this.supabase
      .from('submissions_admin')
      .select('id, type, body, is_anonymous, created_at, submitted_by, submitted_by_avatar')
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      id: row['id'] as string,
      type: row['type'] as AdminSubmission['type'],
      body: row['body'] as string,
      isAnonymous: row['is_anonymous'] as boolean,
      createdAt: row['created_at'] as string,
      submittedBy: row['submitted_by'] as string | null,
      submittedByAvatar: row['submitted_by_avatar'] as string | null,
    }));
  }

  async listResponses(submissionIds: string[]): Promise<SubmissionResponse[]> {
    if (submissionIds.length === 0) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('submission_responses')
      .select('id, submission_id, body, created_at, responder:users(name)')
      .in('submission_id', submissionIds)
      .order('created_at', { ascending: true });

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      id: row['id'] as string,
      submissionId: row['submission_id'] as string,
      body: row['body'] as string,
      createdAt: row['created_at'] as string,
      responderName: this.extractResponderName(row['responder']),
    }));
  }

  private extractResponderName(responder: unknown): string | null {
    const record = Array.isArray(responder) ? responder[0] : responder;
    return (record as { name?: string } | null)?.name ?? null;
  }

  async respond(submissionId: string, body: string): Promise<{ response: SubmissionResponse | null } & ActionResult> {
    const responderId = this.session.session()?.user.id;
    if (!responderId) {
      return { response: null, error: 'Not signed in' };
    }

    const { data, error } = await this.supabase
      .from('submission_responses')
      .insert({ submission_id: submissionId, responder_id: responderId, body })
      .select('id, submission_id, body, created_at')
      .single();

    if (error || !data) {
      return { response: null, error: error?.message ?? 'Failed to send reply' };
    }

    return {
      error: null,
      response: {
        id: data['id'] as string,
        submissionId: data['submission_id'] as string,
        body: data['body'] as string,
        createdAt: data['created_at'] as string,
        responderName: this.session.profile()?.name ?? null,
      },
    };
  }
}
