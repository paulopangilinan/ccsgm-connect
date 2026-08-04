import { Component, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { ThemeToggle } from './shared/theme-toggle/theme-toggle';
import { Toast } from './shared/toast/toast';
import { SessionService } from './core/auth/session.service';
import { IdleTimeoutService } from './core/auth/idle-timeout.service';
import { GlobalNoticeService } from './core/notices/global-notice.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, ThemeToggle, NgOptimizedImage, Toast],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly session = inject(SessionService);
  protected readonly notice = inject(GlobalNoticeService);
  private readonly router = inject(Router);

  // Constructed here so it's active app-wide for the whole session, not just
  // on a specific route.
  private readonly idleTimeout = inject(IdleTimeoutService);

  protected readonly uploadingAvatar = signal(false);
  protected readonly currentYear = new Date().getFullYear();

  protected async signOut(): Promise<void> {
    await this.session.signOut();
    await this.router.navigateByUrl('/');
  }

  // Elders have no profile page to set an avatar from, so the header photo
  // itself doubles as the upload control for them.
  protected async onElderAvatarSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.notice.show('Please choose an image file.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.notice.show('Image must be 5 MB or smaller.', 'error');
      return;
    }

    this.uploadingAvatar.set(true);
    const { error } = await this.session.uploadAvatar(file);
    this.uploadingAvatar.set(false);
    if (error) {
      this.notice.show(error, 'error');
    }
  }
}
