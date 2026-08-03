import { Component, DestroyRef, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NotificationsService } from '../../core/notifications/notifications.service';

@Component({
  selector: 'app-admin',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin {
  protected readonly notifications = inject(NotificationsService);

  constructor() {
    this.notifications.start();
    inject(DestroyRef).onDestroy(() => this.notifications.stop());
  }
}
