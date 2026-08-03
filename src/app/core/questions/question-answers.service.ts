import { Service, inject } from '@angular/core';
import { SupabaseClientService } from '../supabase/supabase-client';
import { SessionService } from '../auth/session.service';
import { Question } from './question';

interface ActionResult {
  error: string | null;
}

const SECTOR_LABELS = ['Sector 1', 'Sector 2', 'Sector 3', 'Sector 4', 'Sector 5'];

@Service()
export class QuestionAnswersService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly session = inject(SessionService);

  async listForCurrentUser(): Promise<Map<string, unknown>> {
    const userId = this.session.session()?.user.id;
    if (!userId) {
      return new Map();
    }

    const { data, error } = await this.supabase
      .from('question_answers')
      .select('question_id, answer_value')
      .eq('user_id', userId);

    if (error || !data) {
      return new Map();
    }

    return new Map(data.map((row) => [row['question_id'] as string, row['answer_value']]));
  }

  async saveAnswer(question: Question, value: unknown): Promise<ActionResult> {
    const userId = this.session.session()?.user.id;
    if (!userId) {
      return { error: 'Not signed in' };
    }

    const { error } = await this.supabase.from('question_answers').upsert(
      {
        user_id: userId,
        question_id: question.id,
        answer_value: value,
        question_snapshot: {
          label: question.label,
          field_type: question.fieldType,
          options: question.options,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,question_id' },
    );

    if (error) {
      return { error: error.message };
    }

    if (question.type === 'system_linked' && question.systemKey) {
      return this.applySystemLinkedEffect(userId, question.systemKey, value);
    }

    return { error: null };
  }

  private async applySystemLinkedEffect(
    userId: string,
    systemKey: string,
    value: unknown,
  ): Promise<ActionResult> {
    const patch = this.deriveUsersPatch(systemKey, value);
    if (!patch) {
      return { error: null };
    }

    const { error } = await this.supabase.from('users').update(patch).eq('id', userId);
    return { error: error?.message ?? null };
  }

  private deriveUsersPatch(systemKey: string, value: unknown): Record<string, unknown> | null {
    switch (systemKey) {
      case 'idaf_status':
        return { is_idaf_leader: value === true };
      case 'wants_idaf':
        return { wants_idaf: value === true };
      case 'wants_cef':
        return { wants_cef: value === true };
      case 'cef_sector': {
        const index = SECTOR_LABELS.indexOf(value as string);
        return { cef_sector: index === -1 ? null : index + 1 };
      }
      default:
        return null;
    }
  }
}
