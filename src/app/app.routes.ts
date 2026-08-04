import { Routes } from '@angular/router';
import { elderGuard, memberOnlyGuard, profileCompleteGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/landing/landing').then((m) => m.Landing),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password').then((m) => m.ForgotPassword),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password/reset-password').then((m) => m.ResetPassword),
  },
  {
    path: 'dashboard',
    canActivate: [memberOnlyGuard],
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
    children: [
      { path: '', redirectTo: 'profile', pathMatch: 'full' },
      {
        path: 'profile',
        loadComponent: () => import('./features/dashboard/profile/profile').then((m) => m.Profile),
      },
      {
        path: 'prayers',
        canActivate: [profileCompleteGuard],
        loadComponent: () => import('./features/dashboard/prayers/prayers').then((m) => m.Prayers),
      },
      {
        path: 'testimonies',
        canActivate: [profileCompleteGuard],
        loadComponent: () => import('./features/dashboard/testimonies/testimonies').then((m) => m.Testimonies),
      },
      {
        path: 'counseling',
        canActivate: [profileCompleteGuard],
        loadComponent: () => import('./features/counseling/counseling').then((m) => m.Counseling),
      },
    ],
  },
  { path: 'onboarding', redirectTo: 'dashboard/profile' },
  { path: 'counseling', redirectTo: 'dashboard/counseling' },
  {
    path: 'admin',
    canActivate: [elderGuard],
    loadComponent: () => import('./features/admin/admin').then((m) => m.Admin),
    children: [
      { path: '', redirectTo: 'members', pathMatch: 'full' },
      {
        path: 'submissions',
        data: { type: 'prayer_request' },
        loadComponent: () =>
          import('./features/admin/submissions/admin-submissions').then((m) => m.AdminSubmissions),
      },
      {
        path: 'counseling',
        data: { type: 'counsel_request' },
        loadComponent: () =>
          import('./features/admin/submissions/admin-submissions').then((m) => m.AdminSubmissions),
      },
      {
        path: 'testimonies',
        loadComponent: () =>
          import('./features/admin/testimonies/admin-testimonies').then((m) => m.AdminTestimonies),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/admin/settings/settings').then((m) => m.Settings),
        children: [
          { path: '', redirectTo: 'questions', pathMatch: 'full' },
          {
            path: 'questions',
            loadComponent: () =>
              import('./features/admin/questions/admin-questions').then((m) => m.AdminQuestions),
          },
          {
            path: 'notifications',
            loadComponent: () =>
              import('./features/admin/notifications/admin-notifications').then((m) => m.AdminNotifications),
          },
        ],
      },
      {
        path: 'members',
        loadComponent: () =>
          import('./features/admin/members/admin-members').then((m) => m.AdminMembers),
      },
      {
        path: 'birthdays',
        loadComponent: () =>
          import('./features/admin/birthdays/admin-birthdays').then((m) => m.AdminBirthdays),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
