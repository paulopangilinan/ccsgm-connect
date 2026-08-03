import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SubmissionsService } from '../../../core/submissions/submissions.service';
import { AdminSubmission, SubmissionResponse, SubmissionType } from '../../../core/submissions/submission';
import { ToggleSwitch } from '../../../shared/toggle-switch/toggle-switch';

type FilterType = 'all' | SubmissionType;

interface MemberGroup {
  name: string;
  avatar: string | null;
  items: AdminSubmission[];
}

const TYPE_LABELS: Record<SubmissionType, string> = {
  prayer_request: 'Prayer request',
  testimony: 'Testimony',
  counsel_request: 'Counsel request',
};

@Component({
  selector: 'app-admin-submissions',
  imports: [DatePipe, ToggleSwitch],
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
  protected readonly replyingId = signal<string | null>(null);
  protected readonly replyAnonymous = signal(false);
  protected readonly replySms = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly smsNote = signal<string | null>(null);

  protected readonly filters: { value: FilterType; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'prayer_request', label: 'Prayer requests' },
    { value: 'testimony', label: 'Testimonies' },
    { value: 'counsel_request', label: 'Counsel requests' },
  ];

  protected readonly groups = computed<MemberGroup[]>(() => {
    const filter = this.filter();
    const all = this.submissions();
    const filtered = filter === 'all' ? all : all.filter((s) => s.type === filter);

    const map = new Map<string, MemberGroup>();
    for (const submission of filtered) {
      const name = submission.submittedBy ?? 'Anonymous';
      const group = map.get(name) ?? { name, avatar: submission.submittedByAvatar, items: [] };
      group.items.push(submission);
      map.set(name, group);
    }
    return [...map.values()];
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

  protected startReply(submissionId: string): void {
    this.replyingId.set(submissionId);
    this.replyAnonymous.set(false);
    this.replySms.set(false);
    this.smsNote.set(null);
  }

  protected cancelReply(submissionId: string): void {
    if (this.replyingId() === submissionId) {
      this.replyingId.set(null);
    }
    this.setDraft(submissionId, '');
  }

  protected async sendReply(submissionId: string): Promise<void> {
    const body = this.draftFor(submissionId).trim();
    if (!body || this.sendingId() !== null) {
      return;
    }

    this.errorMessage.set(null);
    this.smsNote.set(null);
    const isAnonymous = this.replyAnonymous();
    const wantsSms = this.replySms();
    this.sendingId.set(submissionId);
    const { response, error } = await this.submissionsService.respond(submissionId, body, isAnonymous);

    if (error || !response) {
      this.sendingId.set(null);
      this.errorMessage.set(error ?? 'Failed to send reply');
      return;
    }

    const grouped = new Map(this.responsesBySubmission());
    grouped.set(submissionId, [...(grouped.get(submissionId) ?? []), response]);
    this.responsesBySubmission.set(grouped);
    this.setDraft(submissionId, '');
    this.replyingId.set(null);

    if (wantsSms) {
      const sms = await this.submissionsService.sendReplySms(submissionId, body, isAnonymous);
      this.smsNote.set(sms.sent ? 'SMS sent to the member.' : `Reply saved, but SMS was not sent: ${sms.error}`);
    }

    this.sendingId.set(null);
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
