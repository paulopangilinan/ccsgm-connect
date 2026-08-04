import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

// Groups the site-configuration/maintenance style admin pages (Questions,
// Notifications) under one shared sub-nav, separate from the content-review
// tabs (Members, Prayer corner, Counseling, Testimonies, Birthdays) in admin.html.
@Component({
  selector: 'app-admin-settings',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {}
