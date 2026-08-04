import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, SlicePipe } from '@angular/common';
import { SubmissionsService } from '../../../core/submissions/submissions.service';
import { TestimoniesService } from '../../../core/testimonies/testimonies.service';
import { Testimony } from '../../../core/testimonies/testimony';
import { MySubmission } from '../../../core/submissions/submission';
import { TestimonyForm } from '../testimony-form/testimony-form';

@Component({
  selector: 'app-testimonies',
  imports: [DatePipe, SlicePipe, TestimonyForm],
  templateUrl: './testimonies.html',
  styleUrl: './testimonies.css',
})
export class Testimonies {
  private readonly submissionsService = inject(SubmissionsService);
  private readonly testimoniesService = inject(TestimoniesService);

  protected readonly loading = signal(true);
  protected readonly testimonies = signal<Testimony[]>([]);
  protected readonly answeredPrayers = signal<MySubmission[]>([]);
  protected readonly showForm = signal(false);
  protected readonly selectedPrayerId = signal<string | null>(null);

  // Answered prayers not yet linked to a testimony -- once a prayer has a
  // testimony, it drops out of the picker (mirrors the Prayer corner page,
  // which hides "Write a testimony about this" once one exists).
  protected readonly linkablePrayers = computed(() => {
    const linked = new Set(this.testimonies().map((t) => t.linkedPrayerId).filter((id): id is string => !!id));
    return this.answeredPrayers().filter((p) => !linked.has(p.id));
  });

  constructor() {
    void this.load();
  }

  protected openForm(): void {
    this.selectedPrayerId.set(null);
    this.showForm.set(true);
  }

  protected closeForm(): void {
    this.showForm.set(false);
  }

  protected async onSaved(): Promise<void> {
    this.showForm.set(false);
    await this.load();
  }

  protected statusLabel(testimony: Testimony): string | null {
    if (!testimony.shareToWebsite) {
      return null;
    }
    switch (testimony.websiteReviewStatus) {
      case 'approved':
        return 'Approved by your elders';
      case 'rejected':
        return 'Not approved for the website';
      default:
        return 'Awaiting elder review';
    }
  }

  protected statusClass(testimony: Testimony): string {
    switch (testimony.websiteReviewStatus) {
      case 'approved':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300';
      case 'rejected':
        return 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-400';
      default:
        return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    const [testimonies, submissions] = await Promise.all([
      this.testimoniesService.listMine(),
      this.submissionsService.listMine(),
    ]);
    this.testimonies.set(testimonies);
    this.answeredPrayers.set(submissions.filter((s) => s.type === 'prayer_request' && s.isAnswered));
    this.loading.set(false);
  }
}
