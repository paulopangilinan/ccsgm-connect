import { Service, signal } from '@angular/core';
import type { ToastTone } from '../../shared/toast/toast';

/**
 * App-wide toast notice, mounted once in the root component so it survives
 * route navigation (e.g. the message shown right after an idle sign-out
 * redirects to /login).
 */
@Service()
export class GlobalNoticeService {
  readonly message = signal<string | null>(null);
  readonly tone = signal<ToastTone>('info');

  show(message: string, tone: ToastTone = 'info'): void {
    this.tone.set(tone);
    this.message.set(message);
  }

  clear(): void {
    this.message.set(null);
  }
}
