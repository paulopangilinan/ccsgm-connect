import { Component, DestroyRef, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { NotificationsService } from '../../core/notifications/notifications.service';

@Component({
  selector: 'app-admin',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin {
  protected readonly notifications = inject(NotificationsService);
  private readonly router = inject(Router);

  // Settings (Questions/Notifications) has its own sub-nav -- showing the main
  // dashboard tab bar above it too is confusing, so it's hidden there in favor
  // of a single "Back to dashboard" link.
  protected readonly inSettings = signal(this.router.url.includes('/admin/settings'));

  constructor() {
    this.notifications.start();
    inject(DestroyRef).onDestroy(() => this.notifications.stop());

    const subscription = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => this.inSettings.set(event.urlAfterRedirects.includes('/admin/settings')));
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }
}
