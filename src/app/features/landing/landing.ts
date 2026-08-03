import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';

@Component({
  selector: 'app-landing',
  imports: [RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  constructor() {
    // Signed-in users' home is their own area, not the marketing page.
    void this.redirectIfAuthenticated();
  }

  private async redirectIfAuthenticated(): Promise<void> {
    await this.session.whenReady();
    if (this.session.isElder()) {
      await this.router.navigateByUrl('/admin');
    } else if (this.session.isAuthenticated()) {
      await this.router.navigateByUrl('/dashboard');
    }
  }

  protected readonly features = [
    {
      emoji: '🙏',
      title: 'Prayer requests',
      description: 'Send in what’s on your heart, anytime — attributed or anonymous, your call.',
    },
    {
      emoji: '✨',
      title: 'Testimonies',
      description: 'Share what God’s been doing in your life with the elders, in confidence.',
    },
    {
      emoji: '💬',
      title: 'Counsel',
      description: 'Need to talk something through? Reach out for guidance, privately.',
    },
  ];
}
