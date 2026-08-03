import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SubmissionsService } from '../../../core/submissions/submissions.service';
import { AdminSubmission, SubmissionResponse, SubmissionType } from '../../../core/submissions/submission';

type FilterType = 'all' | SubmissionType;

const TYPE_LABELS: Record<SubmissionType, string> = {
  prayer_request: 'Prayer request',
  testimony: 'Testimony',
  counsel_request: 'Counsel request',
};

@Component({
  selector: 'app-admin-submissions',
  imports: [DatePipe],
  templateUrl: './admin-submissions.html',
  styleUrl: './admin-submissions.css',
})
export class AdminSubmissions {
  private readonly submissionsService = inject(SubmissionsService);

  protected readonly loading = signal(true);
  protected readonly submissions = signal<AdminSubmission[]>([]);
  protected readonly responsesBySubmission = signal<Map<string, SubmissionResponse[]>>(new Map());
  protected readonly filter = signal<FilterType>('all');
  protected readonly drafts = signal<Map<string, string>>(new Map());
  protected readonly sendingId = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly filters: { value: FilterType; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'prayer_request', label: 'Prayer requests' },
    { value: 'testimony', label: 'Testimonies' },
    { value: 'counsel_request', label: 'Counsel requests' },
  ];

  protected readonly filtered = computed(() => {
    const filter = this.filter();
    const all = this.submissions();
    return filter === 'all' ? all : all.filter((s) => s.type === filter);
  });

  constructor() {
    void this.load();
  }

  protected typeLabel(type: SubmissionType): string {
    return TYPE_LABELS[type];
  }

  protected responsesFor(submissionId: string): SubmissionResponse[] {
    return this.responsesBySubmission().get(submissionId) ?? [];
  }

  protected draftFor(submissionId: string): string {
    return this.drafts().get(submissionId) ?? '';
  }

  protected setDraft(submissionId: string, value: string): void {
    const next = new Map(this.drafts());
    next.set(submissionId, value);
    this.drafts.set(next);
  }

  protected setFilter(filter: FilterType): void {
    this.filter.set(filter);
  }

  protected async sendReply(submissionId: string): Promise<void> {
    const body = this.draftFor(submissionId).trim();
    if (!body || this.sendingId() !== null) {
      return;
    }

    this.errorMessage.set(null);
    this.sendingId.set(submissionId);
    const { response, error } = await this.submissionsService.respond(submissionId, body);
    this.sendingId.set(null);

    if (error || !response) {
      this.errorMessage.set(error ?? 'Failed to send reply');
      return;
    }

    const grouped = new Map(this.responsesBySubmission());
    grouped.set(submissionId, [...(grouped.get(submissionId) ?? []), response]);
    this.responsesBySubmission.set(grouped);
    this.setDraft(submissionId, '');
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    const submissions = await this.submissionsService.listForAdmin();
    this.submissions.set(submissions);

    const responses = await this.submissionsService.listResponses(submissions.map((s) => s.id));
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
