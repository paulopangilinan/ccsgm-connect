import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session.service';

export const authGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);

  await session.whenReady();

  return session.isAuthenticated() || router.createUrlTree(['/login']);
};

export const elderGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);

  await session.whenReady();

  return session.isElder() || router.createUrlTree(['/login']);
};

export const memberOnlyGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);

  await session.whenReady();

  if (!session.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  return !session.isElder() || router.createUrlTree(['/admin']);
};

// Prayer corner and Counseling stay locked until the member finishes their
// profile (name, city address, mobile) -- profile completion comes first.
export const profileCompleteGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);

  await session.whenReady();

  return session.isProfileComplete() || router.createUrlTree(['/dashboard/profile']);
};
