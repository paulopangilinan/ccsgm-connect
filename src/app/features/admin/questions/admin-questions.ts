import { Component, computed, inject, signal } from '@angular/core';
import { QuestionsService } from '../../../core/questions/questions.service';
import { Question, QuestionFieldType } from '../../../core/questions/question';

const FIELD_TYPE_LABELS: Record<QuestionFieldType, string> = {
  text: 'Short text',
  textarea: 'Long text',
  select: 'Multiple choice',
  toggle: 'Yes / No',
  number: 'Number',
};

@Component({
  selector: 'app-admin-questions',
  imports: [],
  templateUrl: './admin-questions.html',
  styleUrl: './admin-questions.css',
})
export class AdminQuestions {
  private readonly questionsService = inject(QuestionsService);

  protected readonly fieldTypes: { value: QuestionFieldType; label: string }[] = (
    Object.entries(FIELD_TYPE_LABELS) as [QuestionFieldType, string][]
  ).map(([value, label]) => ({ value, label }));

  protected readonly loading = signal(true);
  protected readonly questions = signal<Question[]>([]);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly editingId = signal<string | null>(null);
  protected readonly label = signal('');
  protected readonly fieldType = signal<QuestionFieldType>('text');
  protected readonly optionsText = signal('');
  protected readonly parentQuestionId = signal<string | null>(null);
  protected readonly triggerValue = signal<string | null>(null);

  // Only Yes/No and multiple-choice questions can be a parent — conditional
  // logic needs a discrete answer to match against. Exclude the question being
  // edited (no self-reference) and questions that are themselves follow-ups
  // (keep the tree one level deep).
  protected readonly parentCandidates = computed(() =>
    this.questions().filter(
      (q) =>
        (q.fieldType === 'toggle' || q.fieldType === 'select') &&
        !q.parentQuestionId &&
        q.id !== this.editingId(),
    ),
  );

  protected readonly selectedParent = computed(() =>
    this.questions().find((q) => q.id === this.parentQuestionId()) ?? null,
  );

  protected readonly triggerOptions = computed<{ value: string; label: string }[]>(() => {
    const parent = this.selectedParent();
    if (!parent) {
      return [];
    }
    if (parent.fieldType === 'toggle') {
      return [
        { value: 'true', label: 'Yes' },
        { value: 'false', label: 'No' },
      ];
    }
    return (parent.options ?? []).map((option) => ({ value: option, label: option }));
  });

  constructor() {
    void this.load();
  }

  protected fieldTypeLabel(type: QuestionFieldType): string {
    return FIELD_TYPE_LABELS[type];
  }

  protected parentLabel(parentId: string | null): string {
    if (!parentId) {
      return '';
    }
    return this.questions().find((q) => q.id === parentId)?.label ?? 'a deleted question';
  }

  protected triggerLabel(question: Question): string {
    const parent = this.questions().find((q) => q.id === question.parentQuestionId);
    if (parent?.fieldType === 'toggle') {
      return question.triggerValue === 'true' ? 'Yes' : 'No';
    }
    return question.triggerValue ?? '';
  }

  protected setParent(parentId: string): void {
    this.parentQuestionId.set(parentId || null);
    this.triggerValue.set(null);
  }

  protected startEdit(question: Question): void {
    this.editingId.set(question.id);
    this.label.set(question.label);
    this.fieldType.set(question.fieldType);
    this.optionsText.set((question.options ?? []).join('\n'));
    this.parentQuestionId.set(question.parentQuestionId);
    this.triggerValue.set(question.triggerValue);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.label.set('');
    this.fieldType.set('text');
    this.optionsText.set('');
    this.parentQuestionId.set(null);
    this.triggerValue.set(null);
  }

  protected async save(): Promise<void> {
    const label = this.label().trim();
    if (!label || this.saving()) {
      return;
    }

    const fieldType = this.fieldType();
    const options =
      fieldType === 'select'
        ? this.optionsText()
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
        : null;

    if (fieldType === 'select' && (!options || options.length < 2)) {
      this.errorMessage.set('Add at least two options for a multiple-choice question');
      return;
    }

    const parentQuestionId = this.parentQuestionId();
    const triggerValue = parentQuestionId ? this.triggerValue() : null;
    if (parentQuestionId && !triggerValue) {
      this.errorMessage.set('Choose which answer reveals this follow-up question');
      return;
    }

    this.errorMessage.set(null);
    this.saving.set(true);

    const input = { label, fieldType, options, parentQuestionId, triggerValue };
    const editingId = this.editingId();
    const { error } = editingId
      ? await this.questionsService.update(editingId, input)
      : await this.questionsService.create(input, this.questions().length);

    this.saving.set(false);

    if (error) {
      this.errorMessage.set(error);
      return;
    }

    this.cancelEdit();
    await this.load();
  }

  protected async toggleActive(question: Question): Promise<void> {
    const { error } = await this.questionsService.setActive(question.id, !question.active);
    if (error) {
      this.errorMessage.set(error);
      return;
    }
    await this.load();
  }

  protected async remove(question: Question): Promise<void> {
    if (question.type === 'system_linked') {
      return;
    }
    if (!confirm(`Delete "${question.label}"? Members' past answers are kept as a snapshot.`)) {
      return;
    }

    const { error } = await this.questionsService.remove(question.id);
    if (error) {
      this.errorMessage.set(error);
      return;
    }
    await this.load();
  }

  protected async move(question: Question, direction: 'up' | 'down'): Promise<void> {
    const list = this.questions();
    const index = list.findIndex((q) => q.id === question.id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || targetIndex < 0 || targetIndex >= list.length) {
      return;
    }

    const target = list[targetIndex];
    const { error } = await this.questionsService.swapOrder(
      { id: question.id, orderIndex: question.orderIndex },
      { id: target.id, orderIndex: target.orderIndex },
    );

    if (error) {
      this.errorMessage.set(error);
      return;
    }
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.questions.set(await this.questionsService.list());
    this.loading.set(false);
  }
}
