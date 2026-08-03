import { Service, inject } from '@angular/core';
import { SupabaseClientService } from '../supabase/supabase-client';
import { MemberAnswer, MemberSubmission, MemberSummary } from './member';

interface ActionResult {
  error: string | null;
}

@Service()
export class MembersService {
  private readonly supabase = inject(SupabaseClientService).client;

  async list(): Promise<MemberSummary[]> {
    const { data, error } = await this.supabase
      .from('users')
      .select(
        'id, name, date_of_birth, gender, church, city_address, mobile, role, membership_status, created_at, is_idaf_leader, wants_idaf, cef_sector, wants_cef',
      )
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      id: row['id'] as string,
      name: row['name'] as string,
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
