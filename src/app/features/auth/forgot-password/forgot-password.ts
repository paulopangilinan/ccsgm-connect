import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { form, FormField, required, email as validEmail, submit } from '@angular/forms/signals';
import { SessionService } from '../../../core/auth/session.service';

interface ForgotPasswordModel {
  email: string;
}

@Component({
  selector: 'app-forgot-password',
  imports: [FormField, RouterLink],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.css',
})
export class ForgotPassword {
  private readonly session = inject(SessionService);

  protected readonly model = signal<ForgotPasswordModel>({ email: '' });
  protected readonly requestForm = form(this.model, (path) => {
    required(path.email, { message: 'Enter your email' });
    validEmail(path.email, { message: 'Enter a valid email' });
  });

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly sent = signal(false);

  protected submitRequest(): void {
    this.formError.set(null);
    this.requestForm().markAsTouched();

    void submit(this.requestForm, async () => {
      this.submitting.set(true);
      const { error } = await this.session.requestPasswordReset(this.model().email);
      this.submitting.set(false);

      if (error) {
        this.formError.set(error);
        return;
      }
      this.sent.set(true);
    });
  }
}
