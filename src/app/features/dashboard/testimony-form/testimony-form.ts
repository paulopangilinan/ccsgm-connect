import { Component, inject, input, output, signal } from '@angular/core';
import { TestimoniesService } from '../../../core/testimonies/testimonies.service';
import { ContentSnippetsService } from '../../../core/content/content-snippets.service';
import { ToggleSwitch } from '../../../shared/toggle-switch/toggle-switch';
import { GlobalNoticeService } from '../../../core/notices/global-notice.service';

interface ImageItem {
  file: File;
  url: string;
}

const MAX_IMAGES = 6;
const MAX_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'app-testimony-form',
  imports: [ToggleSwitch],
  templateUrl: './testimony-form.html',
  styleUrl: './testimony-form.css',
})
export class TestimonyForm {
  private readonly testimonies = inject(TestimoniesService);
  private readonly contentSnippets = inject(ContentSnippetsService);
  private readonly notice = inject(GlobalNoticeService);

  readonly linkedPrayerId = input<string | null>(null);
  readonly saved = output<void>();
  readonly cancelled = output<void>();

  protected readonly body = signal('');
  protected readonly shareToWebsite = signal(false);
  protected readonly isAnonymous = signal(false);
  protected readonly images = signal<ImageItem[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly consentClause = signal('');

  constructor() {
    void this.loadClause();
  }

  protected setShareToWebsite(value: boolean): void {
    this.shareToWebsite.set(value);
    if (!value) {
      this.isAnonymous.set(false);
    }
  }

  protected onImagesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.error.set(null);

    const current = this.images();
    const additions: ImageItem[] = [];

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        this.error.set('Only image files can be attached.');
        continue;
      }
      if (file.size > MAX_BYTES) {
        this.error.set('Each image must be 5 MB or smaller.');
        continue;
      }
      if (current.length + additions.length >= MAX_IMAGES) {
        this.error.set(`You can attach up to ${MAX_IMAGES} images.`);
        break;
      }
      additions.push({ file, url: URL.createObjectURL(file) });
    }

    this.images.set([...current, ...additions]);
  }

  protected removeImage(index: number): void {
    const current = this.images();
    const [removed] = current.splice(index, 1);
    if (removed) {
      URL.revokeObjectURL(removed.url);
    }
    this.images.set([...current]);
  }

  protected async submit(): Promise<void> {
    const body = this.body().trim();
    if (!body || this.saving()) {
      return;
    }

    this.error.set(null);
    this.saving.set(true);
    const { error, mediaWarning } = await this.testimonies.create({
      body,
      shareToWebsite: this.shareToWebsite(),
      isAnonymous: this.shareToWebsite() ? this.isAnonymous() : false,
      linkedPrayerId: this.linkedPrayerId(),
      images: this.images().map((item) => item.file),
    });
    this.saving.set(false);

    if (error) {
      this.error.set(error);
      return;
    }

    for (const item of this.images()) {
      URL.revokeObjectURL(item.url);
    }
    // Shown via the app-wide toast, not the local `error` signal -- this
    // component (and its error banner) unmounts as soon as `saved` is
    // emitted below, so a warning stored locally would never be seen.
    if (mediaWarning) {
      this.notice.show(mediaWarning, 'info');
    }
    this.saved.emit();
  }

  private async loadClause(): Promise<void> {
    this.consentClause.set(await this.contentSnippets.get('consent_clause_testimony'));
  }
}
