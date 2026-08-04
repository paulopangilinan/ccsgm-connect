import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SubmissionsService } from '../../core/submissions/submissions.service';
import { SessionService } from '../../core/auth/session.service';
import { ContentSnippetsService } from '../../core/content/content-snippets.service';
import { MySubmission, SubmissionResponse } from '../../core/submissions/submission';
import { visibleResponses } from '../../core/util/thread';

@Component({
  selector: 'app-counseling',
  imports: [DatePipe],
  templateUrl: './counseling.html',
  styleUrl: './counseling.css',
})
export class Counseling {
  private readonly submissionsService = inject(SubmissionsService);
  private readonly contentSnippets = inject(ContentSnippetsService);
  protected readonly session = inject(SessionService);

  protected readonly loading = signal(true);
  protected readonly requests = signal<MySubmission[]>([]);
  protected readonly responsesBySubmission = signal<Map<string, SubmissionResponse[]>>(new Map());
  protected readonly consentClause = signal('');
  protected readonly expandedThreads = signal<Set<string>>(new Set());

  protected readonly body = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly replyDrafts = signal<Map<string, string>>(new Map());
  protected readonly sendingReplyId = signal<string | null>(null);

  constructor() {
    void this.load();

    const unsubscribe = this.submissionsService.subscribeToResponses((response) => this.addResponse(response));
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  protected responsesFor(requestId: string): SubmissionResponse[] {
    return this.responsesBySubmission().get(requestId) ?? [];
  }

  protected visibleResponsesFor(requestId: string): SubmissionResponse[] {
    return visibleResponses(this.responsesFor(requestId), this.expandedThreads().has(requestId));
  }

  protected hiddenCountFor(requestId: string): number {
    if (this.expandedThreads().has(requestId)) {
      return 0;
    }
    return Math.max(0, this.responsesFor(requestId).length - this.visibleResponsesFor(requestId).length);
  }

  protected toggleThread(requestId: string): void {
    const next = new Set(this.expandedThreads());
    if (next.has(requestId)) {
      next.delete(requestId);
    } else {
      next.add(requestId);
    }
    this.expandedThreads.set(next);
  }

  protected isMine(response: SubmissionResponse): boolean {
    return response.responderId === this.session.profile()?.id;
  }

  protected responseCardClass(response: SubmissionResponse): string {
    return this.isMine(response)
      ? 'border border-brand-200 bg-white dark:border-white/10 dark:bg-brand-500/10'
      : 'bg-brand-50/60 dark:bg-white/5';
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

  protected replyDraftFor(requestId: string): string {
    return this.replyDrafts().get(requestId) ?? '';
  }

  protected setReplyDraft(requestId: string, value: string): void {
    const next = new Map(this.replyDrafts());
    next.set(requestId, value);
    this.replyDrafts.set(next);
  }

  protected async sendReply(requestId: string): Promise<void> {
    const body = this.replyDraftFor(requestId).trim();
    if (!body || this.sendingReplyId() !== null) {
      return;
    }
    this.error.set(null);
    this.sendingReplyId.set(requestId);
    const { response, error } = await this.submissionsService.respond(requestId, body, false);
    this.sendingReplyId.set(null);

    if (error || !response) {
      this.error.set(error ?? 'Failed to send reply');
      return;
    }
    this.addResponse(response);
    this.setReplyDraft(requestId, '');
  }

  protected async submit(): Promise<void> {
    const body = this.body().trim();
    if (!body || this.submitting()) {
      return;
    }

    this.error.set(null);
    this.submitting.set(true);
    const { error } = await this.submissionsService.create('counsel_request', body, false);
    this.submitting.set(false);

    if (error) {
      this.error.set(error);
      return;
    }

    this.body.set('');
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);

    const [submissions, consentClause] = await Promise.all([
      this.submissionsService.listMine(),
      this.consentClause() ? Promise.resolve(this.consentClause()) : this.contentSnippets.get('consent_clause_counsel'),
    ]);

    const requests = submissions.filter((s) => s.type === 'counsel_request');
    this.requests.set(requests);
    this.consentClause.set(consentClause);

    const responses = await this.submissionsService.listResponses(requests.map((r) => r.id));
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
