import { Component, effect, input, output } from '@angular/core';

export type ToastTone = 'success' | 'error' | 'info';

@Component({
  selector: 'app-toast',
  imports: [],
  templateUrl: './toast.html',
  styleUrl: './toast.css',
})
export class Toast {
  readonly message = input.required<string | null>();
  readonly tone = input<ToastTone>('success');
  readonly durationMs = input(4000);
  readonly dismissed = output<void>();

  private timeoutId: ReturnType<typeof setTimeout> | undefined;
  private remainingMs = 0;
  private startedAt = 0;
  private paused = false;

  constructor() {
    effect(() => {
      const message = this.message();
      clearTimeout(this.timeoutId);
      this.paused = false;
      if (message) {
        this.remainingMs = this.durationMs();
        this.startTimer();
      }
    });
  }

  private startTimer(): void {
    this.startedAt = Date.now();
    this.timeoutId = setTimeout(() => this.dismissed.emit(), this.remainingMs);
  }

  // WCAG 2.2.1 (Timing Adjustable): give hover/keyboard-focus users a way to
  // stop the auto-dismiss clock while they're reading or about to click Dismiss.
  protected pause(): void {
    if (this.paused) {
      return;
    }
    this.paused = true;
    clearTimeout(this.timeoutId);
    this.remainingMs = Math.max(0, this.remainingMs - (Date.now() - this.startedAt));
  }

  protected resume(): void {
    if (!this.paused) {
      return;
    }
    this.paused = false;
    this.startTimer();
  }
}
