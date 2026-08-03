import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SubmissionsService } from '../../../core/submissions/submissions.service';
import { MySubmission, SubmissionResponse } from '../../../core/submissions/submission';
import { TestimoniesService } from '../../../core/testimonies/testimonies.service';
import { Testimony } from '../../../core/testimonies/testimony';
import { TestimonyForm } from '../testimony-form/testimony-form';

@Component({
  selector: 'app-prayers',
  imports: [DatePipe, TestimonyForm],
  templateUrl: './prayers.html',
  styleUrl: './prayers.css',
})
export class Prayers {
  private readonly submissionsService = inject(SubmissionsService);
  private readonly testimoniesService = inject(TestimoniesService);

  protected readonly loading = signal(true);
  protected readonly prayers = signal<MySubmission[]>([]);
  protected readonly responsesBySubmission = signal<Map<string, SubmissionResponse[]>>(new Map());
  protected readonly testimonies = signal<Testimony[]>([]);

  protected readonly newPrayer = signal('');
  protected readonly submittingPrayer = signal(false);
  protected readonly prayerError = signal<string | null>(null);

  protected readonly testimonyForPrayerId = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected responsesFor(prayerId: string): SubmissionResponse[] {
    return this.responsesBySubmission().get(prayerId) ?? [];
  }

  protected testimonyForPrayer(prayerId: string): Testimony | undefined {
    return this.testimonies().find((t) => t.linkedPrayerId === prayerId);
  }

  protected async addPrayer(): Promise<void> {
    const body = this.newPrayer().trim();
    if (!body || this.submittingPrayer()) {
      return;
    }
    this.prayerError.set(null);
    this.submittingPrayer.set(true);
    const { error } = await this.submissionsService.create('prayer_request', body, false);
    this.submittingPrayer.set(false);
    if (error) {
      this.prayerError.set(error);
      return;
    }
    this.newPrayer.set('');
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
