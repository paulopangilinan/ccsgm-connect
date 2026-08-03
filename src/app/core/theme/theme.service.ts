import { Service, effect, signal } from '@angular/core';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ccsgm-theme';

@Service()
export class ThemeService {
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
  }

  setPreference(pref: ThemePreference): void {
    this.preference.set(pref);
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
