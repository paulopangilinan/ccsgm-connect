import { Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { SessionService } from '../../../core/auth/session.service';
import { QuestionsService } from '../../../core/questions/questions.service';
import { QuestionAnswersService } from '../../../core/questions/question-answers.service';
import { GreetingsService, Greeting } from '../../../core/greetings/greetings.service';
import { Question } from '../../../core/questions/question';
import { Gender } from '../../../core/auth/app-user';
import { DatePicker } from '../../../shared/date-picker/date-picker';
import { CameraCapture } from '../../../shared/camera-capture/camera-capture';
import { Toast } from '../../../shared/toast/toast';

@Component({
  selector: 'app-profile',
  imports: [NgTemplateOutlet, DatePicker, CameraCapture, Toast],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile {
  protected readonly session = inject(SessionService);
  private readonly questionsService = inject(QuestionsService);
  private readonly questionAnswers = inject(QuestionAnswersService);
  private readonly greetingsService = inject(GreetingsService);

  protected readonly greetings = signal<Greeting[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly savedMessage = signal<string | null>(null);

  protected readonly uploadingAvatar = signal(false);
  protected readonly avatarError = signal<string | null>(null);
  protected readonly cameraOpen = signal(false);

  protected readonly questions = signal<Question[]>([]);
  protected readonly answers = signal<Map<string, unknown>>(new Map());

  protected readonly name = signal('');
  protected readonly dateOfBirth = signal<string | null>(null);
  protected readonly gender = signal<Gender | null>(null);
  protected readonly church = signal('CCSGM Kawit');
  protected readonly cityAddress = signal('');
  protected readonly mobile = signal('');

  protected readonly topLevelQuestions = computed(() => this.questions().filter((q) => !q.parentQuestionId));

  protected readonly visibleQuestions = computed(() => {
    const all = this.questions();
    const result: Question[] = [];
    for (const question of all.filter((q) => !q.parentQuestionId)) {
      result.push(question);
      for (const child of all.filter((c) => c.parentQuestionId === question.id)) {
        if (this.isChildVisible(child)) {
          result.push(child);
        }
      }
    }
    return result;
  });

  constructor() {
    void this.load();
  }

  protected async onAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.avatarError.set('Please choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.avatarError.set('Image must be 5 MB or smaller.');
      return;
    }
    await this.uploadAvatar(file);
  }

  protected async onPhotoCaptured(file: File): Promise<void> {
    this.cameraOpen.set(false);
    await this.uploadAvatar(file);
  }

  private async uploadAvatar(file: File): Promise<void> {
    this.avatarError.set(null);
    this.uploadingAvatar.set(true);
    const { error } = await this.session.uploadAvatar(file);
    this.uploadingAvatar.set(false);
    if (error) {
      this.avatarError.set(error);
    }
  }

  protected childrenOf(questionId: string): Question[] {
    return this.questions().filter((q) => q.parentQuestionId === questionId);
  }

  protected isChildVisible(child: Question): boolean {
    if (!child.parentQuestionId || child.triggerValue === null) {
      return false;
    }
    return String(this.answers().get(child.parentQuestionId)) === child.triggerValue;
  }

  protected answerFor(questionId: string): unknown {
    return this.answers().get(questionId);
  }

  protected setAnswer(questionId: string, value: unknown): void {
    const next = new Map(this.answers());
    next.set(questionId, value);
    for (const child of this.childrenOf(questionId)) {
      const stillVisible = child.triggerValue !== null && String(value) === child.triggerValue;
      if (!stillVisible) {
        next.delete(child.id);
      }
    }
    this.answers.set(next);
  }

  protected async save(): Promise<void> {
    if (this.saving()) {
      return;
    }
    const name = this.name().trim();
    if (!name) {
      this.errorMessage.set('Enter your name');
      return;
    }

    this.errorMessage.set(null);
    this.savedMessage.set(null);
    this.saving.set(true);

    const profileResult = await this.session.updateProfileBasics({
      name,
      dateOfBirth: this.dateOfBirth(),
      gender: this.gender(),
      church: this.church().trim() || 'CCSGM Kawit',
      cityAddress: this.cityAddress().trim() || null,
      mobile: this.mobile().trim() || null,
    });
    if (profileResult.error) {
      this.errorMessage.set(profileResult.error);
      this.saving.set(false);
      return;
    }

    for (const question of this.visibleQuestions()) {
      const value = this.answerFor(question.id);
      if (value === undefined || value === null || value === '') {
        continue;
      }
      const { error } = await this.questionAnswers.saveAnswer(question, value);
      if (error) {
        this.errorMessage.set(error);
        this.saving.set(false);
        return;
      }
    }

    this.saving.set(false);
    this.savedMessage.set('Profile saved.');
  }

  private async load(): Promise<void> {
    this.loading.set(true);

    const profile = this.session.profile();
    this.name.set(profile?.name ?? '');
    this.dateOfBirth.set(profile?.dateOfBirth ?? null);
    this.gender.set(profile?.gender ?? null);
    this.church.set(profile?.church ?? 'CCSGM Kawit');
    this.cityAddress.set(profile?.cityAddress ?? '');
    this.mobile.set(profile?.mobile ?? '');

    const [questions, existingAnswers, greetings] = await Promise.all([
      this.questionsService.listActive(),
      this.questionAnswers.listForCurrentUser(),
      this.greetingsService.listRecentForCurrentUser(),
    ]);
    this.questions.set(questions);
    this.answers.set(existingAnswers);
    this.greetings.set(greetings);
    this.loading.set(false);
  }
}
