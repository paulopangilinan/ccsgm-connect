import type { ThemePreference } from '../theme/theme.service';

export type UserRole = 'member' | 'elder';
export type Gender = 'male' | 'female';
export type MembershipStatus = 'pending' | 'approved' | 'rejected';

// Only meaningful for elders (see admin/settings/notifications), but lives on
// every profile row like the rest of AppUser.
export interface NotificationPreferences {
  notifyNewMembers: boolean;
  notifyPrayerRequests: boolean;
  notifyNewTestimonies: boolean;
  notifyCounselingRequests: boolean;
}

export interface AppUser {
  id: string;
  role: UserRole;
  name: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  church: string;
  cityAddress: string | null;
  mobile: string | null;
  membershipStatus: MembershipStatus;
  themePreference: ThemePreference;
  avatarUrl: string | null;
  branchId: string | null;
  groupId: string | null;
  notificationPreferences: NotificationPreferences;
}

export interface ProfileBasics {
  name: string;
  dateOfBirth: string | null;
  gender: Gender | null;
  church: string;
  cityAddress: string | null;
  mobile: string | null;
}
