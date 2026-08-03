export type QuestionFieldType = 'text' | 'textarea' | 'select' | 'toggle' | 'number';
export type QuestionType = 'plain' | 'system_linked';

export interface Question {
  id: string;
  type: QuestionType;
  systemKey: string | null;
  label: string;
  fieldType: QuestionFieldType;
  options: string[] | null;
  parentQuestionId: string | null;
  triggerValue: string | null;
  orderIndex: number;
  active: boolean;
}

export interface QuestionInput {
  label: string;
  fieldType: QuestionFieldType;
  options: string[] | null;
  parentQuestionId: string | null;
  triggerValue: string | null;
}
