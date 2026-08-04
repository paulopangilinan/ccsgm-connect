import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TestimoniesService } from '../../../core/testimonies/testimonies.service';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import { AdminTestimony, WebsiteReviewStatus } from '../../../core/testimonies/testimony';
import { anonymousAuthor } from '../../../core/util/anonymous-author';

type FilterStatus = 'all' | WebsiteReviewStatus;

@Component({
  selector: 'app-admin-testimonies',
  imports: [DatePipe],
  templateUrl: './admin-testimonies.html',
  styleUrl: './admin-testimonies.css',
})
export class AdminTestimonies {
  private readonly testimonies = inject(TestimoniesService);
  private readonly notifications = inject(NotificationsService);

  protected readonly loading = signal(true);
  protected readonly items = signal<AdminTestimony[]>([]);
  protected readonly filter = signal<FilterStatus>('all');
  protected readonly updatingId = signal<string | null>(null);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly rejectingId = signal<string | null>(null);
  protected readonly rejectNote = signal('');

  protected readonly filters: { value: FilterStatus; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
  ];

  protected readonly filtered = computed(() => {
    const status = this.filter();
    return status === 'all' ? this.items() : this.items().filter((t) => t.websiteReviewStatus === status);
  });

  constructor() {
    void this.load();

    // Opening this tab clears its badge, regardless of whether anything gets
    // approved/rejected -- the count is "shared since I last looked", not
    // "still awaiting review".
    void this.notifications.markTestimoniesViewed();

    // Reload live when a member submits a new testimony.
    let first = true;
    effect(() => {
      this.notifications.activityTick();
      if (first) {
        first = false;
        return;
      }
      void this.load();
    });
  }

  protected setFilter(status: FilterStatus): void {
    this.filter.set(status);
  }

  protected authorPreview(item: AdminTestimony): string {
    return item.isAnonymous ? anonymousAuthor(item.submitterGender, item.submitterChurch) : item.submitterName;
  }

  protected async approve(item: AdminTestimony): Promise<void> {
    if (this.updatingId()) {
      return;
    }
    this.errorMessage.set(null);
    this.updatingId.set(item.id);
    const { error } = await this.testimonies.setReviewStatus(item.id, 'approved');
    if (error) {
      this.updatingId.set(null);
      this.errorMessage.set(error);
      return;
    }

    // Push to the website right away -- the common path needs no separate
    // manual sync step. A failure here just leaves the row retryable.
    const { error: syncError } = await this.testimonies.publishToWebsite(item.id);
    this.updatingId.set(null);
    if (syncError) {
      this.errorMessage.set(syncError);
    }
    await this.load();
  }

  protected startReject(item: AdminTestimony): void {
    this.rejectingId.set(item.id);
    this.rejectNote.set('');
  }

  protected cancelReject(): void {
    this.rejectingId.set(null);
    this.rejectNote.set('');
  }

  protected async confirmReject(item: AdminTestimony): Promise<void> {
    if (this.updatingId()) {
      return;
    }
    this.errorMessage.set(null);
    this.updatingId.set(item.id);
    const note = this.rejectNote().trim();
    const { error } = await this.testimonies.setReviewStatus(item.id, 'rejected', note || undefined);
    this.updatingId.set(null);
    if (error) {
      this.errorMessage.set(error);
      return;
    }
    this.rejectingId.set(null);
    this.rejectNote.set('');
    await this.load();
  }

  protected async retrySync(item: AdminTestimony): Promise<void> {
    if (this.updatingId()) {
      return;
    }
    this.errorMessage.set(null);
    this.updatingId.set(item.id);
    const { error } = await this.testimonies.publishToWebsite(item.id);
    this.updatingId.set(null);
    if (error) {
      this.errorMessage.set(error);
    }
    await this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.items.set(await this.testimonies.listForAdmin());
    this.loading.set(false);
  }
}
