import { Service, effect, inject, signal } from '@angular/core';
import { SessionService } from '../auth/session.service';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ccsgm-theme';

@Service()
export class ThemeService {
  private readonly session = inject(SessionService);
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');

  readonly preference = signal<ThemePreference>(this.readStoredPreference());
  readonly isDark = signal<boolean>(this.resolveIsDark(this.preference()));

  constructor() {
    this.media.addEventListener('change', () => {
      if (this.preference() === 'system') {
        this.applyIsDark(this.resolveIsDark('system'));
      }
    });

    effect(() => {
      const pref = this.preference();
      if (pref === 'system') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, pref);
      }
      this.applyIsDark(this.resolveIsDark(pref));
    });

    // Once signed in, the account's saved preference follows the member across
    // devices/browsers and takes over from whatever was applied locally.
    effect(() => {
      const saved = this.session.profile()?.themePreference;
      if (saved) {
        this.preference.set(saved);
      }
    });
  }

  setPreference(pref: ThemePreference): void {
    this.preference.set(pref);
    if (this.session.isAuthenticated()) {
      void this.session.updateThemePreference(pref);
    }
  }

  toggle(): void {
    this.setPreference(this.isDark() ? 'light' : 'dark');
  }

  private readStoredPreference(): ThemePreference {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  }

  private resolveIsDark(pref: ThemePreference): boolean {
    return pref === 'system' ? this.media.matches : pref === 'dark';
  }

  private applyIsDark(isDark: boolean): void {
    this.isDark.set(isDark);
    document.documentElement.classList.toggle('dark', isDark);
  }
}
