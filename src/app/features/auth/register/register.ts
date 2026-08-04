import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, required, email as validEmail, minLength, validate, submit } from '@angular/forms/signals';
import { SessionService } from '../../../core/auth/session.service';

interface RegisterModel {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

@Component({
  selector: 'app-register',
  imports: [FormField, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly model = signal<RegisterModel>({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  protected readonly registerForm = form(this.model, (path) => {
    required(path.name, { message: 'Enter your name' });
    required(path.email, { message: 'Enter your email' });
    validEmail(path.email, { message: 'Enter a valid email' });
    required(path.password, { message: 'Enter a password' });
    minLength(path.password, 8, { message: 'Password must be at least 8 characters' });
    required(path.confirmPassword, { message: 'Confirm your password' });
    validate(path.confirmPassword, (ctx) =>
      ctx.value() !== ctx.valueOf(path.password) ? { kind: 'mismatch', message: 'Passwords must match' } : undefined,
    );
  });

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly needsEmailConfirmation = signal(false);

  protected submitRegister(): void {
    this.formError.set(null);
    this.needsEmailConfirmation.set(false);
    this.registerForm().markAsTouched();

    void submit(this.registerForm, async () => {
      this.submitting.set(true);
      const { error, needsEmailConfirmation } = await this.session.signUp(
        this.model().email,
        this.model().password,
        this.model().name,
      );
      this.submitting.set(false);

      if (error) {
        this.formError.set(error);
        return;
      }

      if (needsEmailConfirmation) {
        this.needsEmailConfirmation.set(true);
        return;
      }

      await this.router.navigateByUrl('/dashboard');
    });
  }

  protected async continueWithGoogle(): Promise<void> {
    this.formError.set(null);
    const { error } = await this.session.signInWithGoogle();
    if (error) {
      this.formError.set(error);
    }
  }
}
