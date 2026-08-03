import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, required, minLength, validate, submit } from '@angular/forms/signals';
import { SessionService } from '../../../core/auth/session.service';

interface ResetPasswordModel {
  password: string;
  confirmPassword: string;
}

@Component({
  selector: 'app-reset-password',
  imports: [FormField, RouterLink],
  templateUrl: './reset-password.html',
  styleUrl: './reset-password.css',
})
export class ResetPassword {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly checking = signal(true);
  protected readonly linkValid = signal(false);

  protected readonly model = signal<ResetPasswordModel>({ password: '', confirmPassword: '' });
  protected readonly resetForm = form(this.model, (path) => {
    required(path.password, { message: 'Enter a new password' });
    minLength(path.password, 8, { message: 'Password must be at least 8 characters' });
    required(path.confirmPassword, { message: 'Confirm your new password' });
    validate(path.confirmPassword, (ctx) =>
      ctx.value() !== ctx.valueOf(path.password) ? { kind: 'mismatch', message: 'Passwords must match' } : undefined,
    );
  });

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly done = signal(false);

  constructor() {
    void this.checkLink();
  }

  protected submitReset(): void {
    this.formError.set(null);
    this.resetForm().markAsTouched();

    void submit(this.resetForm, async () => {
      this.submitting.set(true);
      const { error } = await this.session.updatePassword(this.model().password);
      this.submitting.set(false);

      if (error) {
        this.formError.set(error);
        return;
      }
      this.done.set(true);
      setTimeout(() => void this.router.navigateByUrl('/dashboard'), 1500);
    });
  }

  private async checkLink(): Promise<void> {
    await this.session.whenReady();
    this.linkValid.set(this.session.isAuthenticated());
    this.checking.set(false);
  }
}
