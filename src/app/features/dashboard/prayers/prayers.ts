import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SubmissionsService } from '../../../core/submissions/submissions.service';
import { SessionService } from '../../../core/auth/session.service';
import { MySubmission, SubmissionResponse } from '../../../core/submissions/submission';
import { TestimoniesService } from '../../../core/testimonies/testimonies.service';
import { Testimony } from '../../../core/testimonies/testimony';
import { TestimonyForm } from '../testimony-form/testimony-form';
import { visibleResponses } from '../../../core/util/thread';
import { GlobalNoticeService } from '../../../core/notices/global-notice.service';

interface ImageItem {
  file: File;
  url: string;
}

const MAX_IMAGES = 6;
const MAX_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'app-prayers',
  imports: [DatePipe, TestimonyForm],
  templateUrl: './prayers.html',
  styleUrl: './prayers.css',
})
export class Prayers {
  private readonly submissionsService = inject(SubmissionsService);
  private readonly testimoniesService = inject(TestimoniesService);
  private readonly notice = inject(GlobalNoticeService);
  protected readonly session = inject(SessionService);

  protected readonly loading = signal(true);
  protected readonly prayers = signal<MySubmission[]>([]);
  protected readonly responsesBySubmission = signal<Map<string, SubmissionResponse[]>>(new Map());
  protected readonly testimonies = signal<Testimony[]>([]);
  protected readonly expandedThreads = signal<Set<string>>(new Set());

  protected readonly showPrayerForm = signal(false);
  protected readonly newPrayer = signal('');
  protected readonly newPrayerImages = signal<ImageItem[]>([]);
  protected readonly submittingPrayer = signal(false);
  protected readonly prayerError = signal<string | null>(null);

  protected readonly replyDrafts = signal<Map<string, string>>(new Map());
  protected readonly sendingReplyId = signal<string | null>(null);

  protected readonly testimonyForPrayerId = signal<string | null>(null);

  constructor() {
    void this.load();

    const unsubscribe = this.submissionsService.subscribeToResponses((response) => this.addResponse(response));
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  protected responsesFor(prayerId: string): SubmissionResponse[] {
    return this.responsesBySubmission().get(prayerId) ?? [];
  }

  protected visibleResponsesFor(prayerId: string): SubmissionResponse[] {
    return visibleResponses(this.responsesFor(prayerId), this.expandedThreads().has(prayerId));
  }

  protected hiddenCountFor(prayerId: string): number {
    if (this.expandedThreads().has(prayerId)) {
      return 0;
    }
    return Math.max(0, this.responsesFor(prayerId).length - this.visibleResponsesFor(prayerId).length);
  }

  protected isMine(response: SubmissionResponse): boolean {
    return response.responderId === this.session.profile()?.id;
  }

  protected responseCardClass(response: SubmissionResponse): string {
    return this.isMine(response)
      ? 'border border-brand-200 bg-white dark:border-white/10 dark:bg-brand-500/10'
      : 'bg-brand-50/60 dark:bg-white/5';
  }

  protected toggleThread(prayerId: string): void {
    const next = new Set(this.expandedThreads());
    if (next.has(prayerId)) {
      next.delete(prayerId);
    } else {
      next.add(prayerId);
    }
    this.expandedThreads.set(next);
  }

  private addResponse(response: SubmissionResponse): void {
    const grouped = new Map(this.responsesBySubmission());
    const existing = grouped.get(response.submissionId) ?? [];
    if (existing.some((r) => r.id === response.id)) {
      return;
    }
    grouped.set(response.submissionId, [...existing, response]);
    this.responsesBySubmission.set(grouped);
  }

  protected replyDraftFor(prayerId: string): string {
    return this.replyDrafts().get(prayerId) ?? '';
  }

  protected setReplyDraft(prayerId: string, value: string): void {
    const next = new Map(this.replyDrafts());
    next.set(prayerId, value);
    this.replyDrafts.set(next);
  }

  protected async sendReply(prayerId: string): Promise<void> {
    const body = this.replyDraftFor(prayerId).trim();
    if (!body || this.sendingReplyId() !== null) {
      return;
    }
    this.prayerError.set(null);
    this.sendingReplyId.set(prayerId);
    const { response, error } = await this.submissionsService.respond(prayerId, body, false);
    this.sendingReplyId.set(null);

    if (error || !response) {
      this.prayerError.set(error ?? 'Failed to send reply');
      return;
    }
    this.addResponse(response);
    this.setReplyDraft(prayerId, '');
  }

  protected testimonyForPrayer(prayerId: string): Testimony | undefined {
    return this.testimonies().find((t) => t.linkedPrayerId === prayerId);
  }

  protected openPrayerForm(): void {
    this.showPrayerForm.set(true);
  }

  protected closePrayerForm(): void {
    this.showPrayerForm.set(false);
    this.newPrayer.set('');
    this.prayerError.set(null);
    for (const item of this.newPrayerImages()) {
      URL.revokeObjectURL(item.url);
    }
    this.newPrayerImages.set([]);
  }

  protected onPrayerImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.prayerError.set(null);

    const current = this.newPrayerImages();
    const additions: ImageItem[] = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        this.prayerError.set('Only image files can be attached.');
        continue;
      }
      if (file.size > MAX_BYTES) {
        this.prayerError.set('Each image must be 5 MB or smaller.');
        continue;
      }
      if (current.length + additions.length >= MAX_IMAGES) {
        this.prayerError.set(`You can attach up to ${MAX_IMAGES} images.`);
        break;
      }
      additions.push({ file, url: URL.createObjectURL(file) });
    }

    this.newPrayerImages.set([...current, ...additions]);
  }

  protected removePrayerImage(index: number): void {
    const current = this.newPrayerImages();
    const [removed] = current.splice(index, 1);
    if (removed) {
      URL.revokeObjectURL(removed.url);
    }
    this.newPrayerImages.set([...current]);
  }

  protected async addPrayer(): Promise<void> {
    const body = this.newPrayer().trim();
    if (!body || this.submittingPrayer()) {
      return;
    }
    this.prayerError.set(null);
    this.submittingPrayer.set(true);
    const images = this.newPrayerImages().map((item) => item.file);
    const { error, mediaWarning } = await this.submissionsService.create('prayer_request', body, false, images);
    this.submittingPrayer.set(false);
    if (error) {
      this.prayerError.set(error);
      return;
    }
    for (const item of this.newPrayerImages()) {
      URL.revokeObjectURL(item.url);
    }
    this.newPrayer.set('');
    this.newPrayerImages.set([]);
    this.showPrayerForm.set(false);
    if (mediaWarning) {
      this.notice.show(mediaWarning, 'info');
    }
    await this.load();
  }

  protected async markAnswered(prayer: MySubmission): Promise<void> {
    const { error } = await this.submissionsService.markPrayerAnswered(prayer.id, true);
    if (error) {
      this.prayerError.set(error);
      return;
    }
    this.testimonyForPrayerId.set(prayer.id);
    await this.load();
  }

  protected async markUnanswered(prayer: MySubmission): Promise<void> {
    const { error } = await this.submissionsService.markPrayerAnswered(prayer.id, false);
    if (error) {
      this.prayerError.set(error);
      return;
    }
    if (this.testimonyForPrayerId() === prayer.id) {
      this.testimonyForPrayerId.set(null);
    }
    await this.load();
  }

  protected openTestimonyForPrayer(prayerId: string): void {
    this.testimonyForPrayerId.set(prayerId);
  }

  protected closeTestimonyForm(): void {
    this.testimonyForPrayerId.set(null);
  }

  protected async onTestimonySaved(): Promise<void> {
    this.testimonyForPrayerId.set(null);
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    const [submissions, testimonies] = await Promise.all([
      this.submissionsService.listMine(),
      this.testimoniesService.listMine(),
    ]);

    const prayers = submissions.filter((s) => s.type === 'prayer_request');
    this.prayers.set(prayers);
    this.testimonies.set(testimonies);

    const responses = await this.submissionsService.listResponses(prayers.map((p) => p.id));
    const grouped = new Map<string, SubmissionResponse[]>();
    for (const response of responses) {
      const list = grouped.get(response.submissionId) ?? [];
      list.push(response);
      grouped.set(response.submissionId, list);
    }
    this.responsesBySubmission.set(grouped);
    this.loading.set(false);
  }
}
