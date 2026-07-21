import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-landing',
  imports: [RouterLink],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
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
