import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, required, email as validEmail, submit } from '@angular/forms/signals';
import { SessionService } from '../../../core/auth/session.service';

interface LoginModel {
  email: string;
  password: string;
}

@Component({
  selector: 'app-login',
  imports: [FormField, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly model = signal<LoginModel>({ email: '', password: '' });
  protected readonly loginForm = form(this.model, (path) => {
    required(path.email, { message: 'Enter your email' });
    validEmail(path.email, { message: 'Enter a valid email' });
    required(path.password, { message: 'Enter your password' });
  });

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected submitLogin(): void {
    this.formError.set(null);
    this.loginForm().markAsTouched();

    void submit(this.loginForm, async () => {
      this.submitting.set(true);
      const { error } = await this.session.signInWithPassword(
        this.model().email,
        this.model().password,
      );
      this.submitting.set(false);

      if (error) {
        this.formError.set(error);
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
