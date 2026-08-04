import { Component, inject, signal } from '@angular/core';
import { SessionService } from '../../../core/auth/session.service';
import { NotificationPreferences } from '../../../core/auth/app-user';
import { ToggleSwitch } from '../../../shared/toggle-switch/toggle-switch';

const DEFAULT_PREFERENCES: NotificationPreferences = {
  notifyNewMembers: true,
  notifyPrayerRequests: true,
  notifyNewTestimonies: true,
  notifyCounselingRequests: true,
};

// Self-service only -- each elder edits their own row. There's no view here
// for one elder to change another's preferences.
@Component({
  selector: 'app-admin-notifications',
  imports: [ToggleSwitch],
  templateUrl: './admin-notifications.html',
  styleUrl: './admin-notifications.css',
})
export class AdminNotifications {
  private readonly session = inject(SessionService);

  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly savedMessage = signal<string | null>(null);
  protected readonly preferences = signal<NotificationPreferences>(
    this.session.profile()?.notificationPreferences ?? DEFAULT_PREFERENCES,
  );

  protected async setPreference(key: keyof NotificationPreferences, value: boolean): Promise<void> {
    const next = { ...this.preferences(), [key]: value };
    this.preferences.set(next);
    this.errorMessage.set(null);
    this.savedMessage.set(null);
    this.saving.set(true);
    const { error } = await this.session.updateNotificationPreferences(next);
    this.saving.set(false);
    if (error) {
      this.errorMessage.set(error);
      return;
    }
    this.savedMessage.set('Saved.');
  }
}
