import { Service, inject } from '@angular/core';
import { SupabaseClientService } from '../supabase/supabase-client';
import { Question, QuestionInput } from './question';

interface ActionResult {
  error: string | null;
}

@Service()
export class QuestionsService {
  private readonly supabase = inject(SupabaseClientService).client;

  async list(): Promise<Question[]> {
    const { data, error } = await this.supabase
      .from('questions')
      .select(
        'id, type, system_key, label, field_type, options, parent_question_id, trigger_value, order_index, active',
      )
      .order('order_index', { ascending: true });

    if (error || !data) {
      return [];
    }

    return data.map((row) => this.toQuestion(row));
  }

  async listActive(): Promise<Question[]> {
    const { data, error } = await this.supabase
      .from('questions')
      .select(
        'id, type, system_key, label, field_type, options, parent_question_id, trigger_value, order_index, active',
      )
      .eq('active', true)
      .order('order_index', { ascending: true });

    if (error || !data) {
      return [];
    }

    return data.map((row) => this.toQuestion(row));
  }

  async create(input: QuestionInput, orderIndex: number): Promise<ActionResult> {
    const { error } = await this.supabase.from('questions').insert({
      type: 'plain',
      label: input.label,
      field_type: input.fieldType,
      options: input.options,
      parent_question_id: input.parentQuestionId,
      trigger_value: input.triggerValue,
      order_index: orderIndex,
    });
    return { error: error?.message ?? null };
  }

  async update(id: string, input: QuestionInput): Promise<ActionResult> {
    const { error } = await this.supabase
      .from('questions')
      .update({
        label: input.label,
        field_type: input.fieldType,
        options: input.options,
        parent_question_id: input.parentQuestionId,
        trigger_value: input.triggerValue,
      })
      .eq('id', id);
    return { error: error?.message ?? null };
  }

  async setActive(id: string, active: boolean): Promise<ActionResult> {
    const { error } = await this.supabase.from('questions').update({ active }).eq('id', id);
    return { error: error?.message ?? null };
  }

  async remove(id: string): Promise<ActionResult> {
    const { error } = await this.supabase.from('questions').delete().eq('id', id);
    return { error: error?.message ?? null };
  }

  async swapOrder(
    a: { id: string; orderIndex: number },
    b: { id: string; orderIndex: number },
  ): Promise<ActionResult> {
    const [first, second] = await Promise.all([
      this.supabase.from('questions').update({ order_index: b.orderIndex }).eq('id', a.id),
      this.supabase.from('questions').update({ order_index: a.orderIndex }).eq('id', b.id),
    ]);
    const error = first.error ?? second.error;
    return { error: error?.message ?? null };
  }

  private toQuestion(row: Record<string, unknown>): Question {
    return {
      id: row['id'] as string,
      type: row['type'] as Question['type'],
      systemKey: row['system_key'] as string | null,
      label: row['label'] as string,
      fieldType: row['field_type'] as Question['fieldType'],
      options: (row['options'] as string[] | null) ?? null,
      parentQuestionId: row['parent_question_id'] as string | null,
      triggerValue: row['trigger_value'] as string | null,
      orderIndex: row['order_index'] as number,
      active: row['active'] as boolean,
    };
  }
}
