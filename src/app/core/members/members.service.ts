import { Service, inject } from '@angular/core';
import { SupabaseClientService } from '../supabase/supabase-client';
import { SessionService } from '../auth/session.service';
import { MemberAnswer, MemberSubmission, MemberSummary } from './member';

interface ActionResult {
  error: string | null;
}

@Service()
export class MembersService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly session = inject(SessionService);

  async list(): Promise<MemberSummary[]> {
    const { data, error } = await this.supabase
      .from('users')
      .select(
        'id, name, avatar_url, date_of_birth, gender, church, city_address, mobile, role, membership_status, created_at, is_idaf_leader, wants_idaf, cef_sector, wants_cef',
      )
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      id: row['id'] as string,
      name: row['name'] as string,
      avatarUrl: row['avatar_url'] as string | null,
      dateOfBirth: row['date_of_birth'] as string | null,
      gender: row['gender'] as MemberSummary['gender'],
      church: (row['church'] as string | null) ?? 'CCSGM Kawit',
      cityAddress: row['city_address'] as string | null,
      mobile: row['mobile'] as string | null,
      role: row['role'] as MemberSummary['role'],
      membershipStatus: (row['membership_status'] as MemberSummary['membershipStatus'] | null) ?? 'pending',
      createdAt: row['created_at'] as string,
      isIdafLeader: row['is_idaf_leader'] as boolean,
      wantsIdaf: row['wants_idaf'] as boolean,
      cefSector: row['cef_sector'] as number | null,
      wantsCef: row['wants_cef'] as boolean,
    }));
  }

  async setMembershipStatus(
    userId: string,
    status: MemberSummary['membershipStatus'],
  ): Promise<ActionResult> {
    const { error } = await this.supabase
      .from('users')
      .update({ membership_status: status })
      .eq('id', userId);
    return { error: error?.message ?? null };
  }

  async deleteMember(memberId: string): Promise<ActionResult> {
    const token = this.session.session()?.access_token;
    if (!token) {
      return { error: 'Not signed in' };
    }

    try {
      const response = await fetch('/api/delete-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ memberId }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        return { error: data.error ?? `Failed to delete member (${response.status})` };
      }
      return { error: null };
    } catch {
      return { error: 'Could not reach the server.' };
    }
  }

  async listAnswers(userId: string): Promise<MemberAnswer[]> {
    const { data, error } = await this.supabase
      .from('question_answers')
      .select('question_id, answer_value, question_snapshot')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error || !data) {
      return [];
    }

    return data.map((row) => {
      const snapshot = (row['question_snapshot'] as Record<string, unknown> | null) ?? {};
      return {
        questionId: row['question_id'] as string | null,
        label: (snapshot['label'] as string | undefined) ?? '(question no longer available)',
        fieldType: (snapshot['field_type'] as string | undefined) ?? 'text',
        value: row['answer_value'],
      };
    });
  }

  // Only non-anonymous submissions: an anonymous submission is meant to be
  // untraceable to the member, so it must never surface under their name here.
  async listSubmissions(userId: string): Promise<MemberSubmission[]> {
    const { data, error } = await this.supabase
      .from('submissions')
      .select('id, type, body, created_at')
      .eq('user_id', userId)
      .eq('is_anonymous', false)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      id: row['id'] as string,
      type: row['type'] as MemberSubmission['type'],
      body: row['body'] as string,
      createdAt: row['created_at'] as string,
    }));
  }
}
