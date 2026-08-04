import { DestroyRef, Service, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from './session.service';
import { GlobalNoticeService } from '../notices/global-notice.service';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;

/**
 * Signs the user out after 15 minutes with no activity. Some of what members
 * submit (prayers, counsel requests) is confidential, so a session shouldn't
 * stay open indefinitely on a shared or unattended device.
 */
@Service()
export class IdleTimeoutService {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly notice = inject(GlobalNoticeService);

  private timeoutId: ReturnType<typeof setTimeout> | undefined;
  private listening = false;

  private readonly onActivity = (): void => {
    this.resetTimer();
  };

  constructor() {
    effect(() => {
      if (this.session.isAuthenticated()) {
        this.startListening();
      } else {
        this.stopListening();
      }
    });

    inject(DestroyRef).onDestroy(() => this.stopListening());
  }

  private startListening(): void {
    if (this.listening) {
      return;
    }
    this.listening = true;
    for (const event of ACTIVITY_EVENTS) {
      document.addEventListener(event, this.onActivity, { passive: true });
    }
    this.resetTimer();
  }

  private stopListening(): void {
    if (!this.listening) {
      return;
    }
    this.listening = false;
    for (const event of ACTIVITY_EVENTS) {
      document.removeEventListener(event, this.onActivity);
    }
    clearTimeout(this.timeoutId);
  }

  private resetTimer(): void {
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => void this.onIdle(), IDLE_TIMEOUT_MS);
  }

  private async onIdle(): Promise<void> {
    this.stopListening();
    await this.session.signOut();
    this.notice.show("You've been signed out due to inactivity.", 'info');
    await this.router.navigateByUrl('/login');
  }
}
