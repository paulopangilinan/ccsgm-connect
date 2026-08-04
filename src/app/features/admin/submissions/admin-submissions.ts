import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DatePipe } from '@angular/common';
import { SubmissionsService } from '../../../core/submissions/submissions.service';
import { AdminSubmission, SubmissionResponse, SubmissionType } from '../../../core/submissions/submission';
import { ToggleSwitch } from '../../../shared/toggle-switch/toggle-switch';
import { visibleResponses } from '../../../core/util/thread';
import { NotificationsService } from '../../../core/notifications/notifications.service';

interface MemberGroup {
  name: string;
  avatar: string | null;
  items: AdminSubmission[];
}

// Shared by admin/submissions (Prayer corner) and admin/counseling -- which
// single SubmissionType this instance shows comes from the route's static
// `data.type` (see app.routes.ts). Reply/SMS/anonymous-thread handling is
// identical either way, so one component backs both tabs.
@Component({
  selector: 'app-admin-submissions',
  imports: [DatePipe, ToggleSwitch],
  templateUrl: './admin-submissions.html',
  styleUrl: './admin-submissions.css',
})
export class AdminSubmissions {
  private readonly submissionsService = inject(SubmissionsService);
  private readonly notifications = inject(NotificationsService);
  private readonly type = inject(ActivatedRoute).snapshot.data['type'] as SubmissionType;

  protected readonly loading = signal(true);
  protected readonly submissions = signal<AdminSubmission[]>([]);
  protected readonly responsesBySubmission = signal<Map<string, SubmissionResponse[]>>(new Map());
  protected readonly drafts = signal<Map<string, string>>(new Map());
  protected readonly sendingId = signal<string | null>(null);
  protected readonly replyingId = signal<string | null>(null);
  protected readonly replyAnonymous = signal(false);
  protected readonly replySms = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly smsNote = signal<string | null>(null);
  protected readonly expandedThreads = signal<Set<string>>(new Set());

  protected readonly groups = computed<MemberGroup[]>(() => {
    const map = new Map<string, MemberGroup>();
    for (const submission of this.submissions()) {
      const name = submission.submittedBy ?? 'Anonymous';
      const group = map.get(name) ?? { name, avatar: submission.submittedByAvatar, items: [] };
      group.items.push(submission);
      map.set(name, group);
    }
    return [...map.values()];
  });

  constructor() {
    void this.load();

    // Opening this tab clears its badge, regardless of whether anything gets
    // replied to -- the count is "unread since I last looked", not "still
    // needs a reply".
    void (this.type === 'prayer_request'
      ? this.notifications.markPrayerCornerViewed()
      : this.notifications.markCounselingViewed());

    const unsubscribe = this.submissionsService.subscribeToResponses((response) => this.addResponse(response));
    inject(DestroyRef).onDestroy(unsubscribe);
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

  protected responsesFor(submissionId: string): SubmissionResponse[] {
    return this.responsesBySubmission().get(submissionId) ?? [];
  }

  protected visibleResponsesFor(submissionId: string): SubmissionResponse[] {
    return visibleResponses(this.responsesFor(submissionId), this.expandedThreads().has(submissionId));
  }

  protected hiddenCountFor(submissionId: string): number {
    if (this.expandedThreads().has(submissionId)) {
      return 0;
    }
    return Math.max(0, this.responsesFor(submissionId).length - this.visibleResponsesFor(submissionId).length);
  }

  protected toggleThread(submissionId: string): void {
    const next = new Set(this.expandedThreads());
    if (next.has(submissionId)) {
      next.delete(submissionId);
    } else {
      next.add(submissionId);
    }
    this.expandedThreads.set(next);
  }

  protected draftFor(submissionId: string): string {
    return this.drafts().get(submissionId) ?? '';
  }

  protected setDraft(submissionId: string, value: string): void {
    const next = new Map(this.drafts());
    next.set(submissionId, value);
    this.drafts.set(next);
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

    this.addResponse(response);
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
    const submissions = await this.submissionsService.listForAdmin(this.type);
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
