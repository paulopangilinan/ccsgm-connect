import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { SubmissionsService } from '../../core/submissions/submissions.service';
import { ContentSnippetsService } from '../../core/content/content-snippets.service';
import { MySubmission, SubmissionResponse } from '../../core/submissions/submission';

@Component({
  selector: 'app-counseling',
  imports: [DatePipe],
  templateUrl: './counseling.html',
  styleUrl: './counseling.css',
})
export class Counseling {
  private readonly submissionsService = inject(SubmissionsService);
  private readonly contentSnippets = inject(ContentSnippetsService);

  protected readonly loading = signal(true);
  protected readonly requests = signal<MySubmission[]>([]);
  protected readonly responsesBySubmission = signal<Map<string, SubmissionResponse[]>>(new Map());
  protected readonly consentClause = signal('');

  protected readonly body = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  protected responsesFor(requestId: string): SubmissionResponse[] {
    return this.responsesBySubmission().get(requestId) ?? [];
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
