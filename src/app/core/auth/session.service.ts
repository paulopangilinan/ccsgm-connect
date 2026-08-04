import { Service, computed, inject, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { SupabaseClientService } from '../supabase/supabase-client';
import { AppUser, NotificationPreferences, ProfileBasics } from './app-user';
import { toProperCase } from '../util/name-case';

interface AuthResult {
  error: string | null;
}

interface SignUpResult extends AuthResult {
  needsEmailConfirmation: boolean;
}

@Service()
export class SessionService {
  private readonly supabase = inject(SupabaseClientService).client;

  private readonly sessionState = signal<Session | null>(null);
  private readonly profileState = signal<AppUser | null>(null);
  private readonly readyState = signal(false);

  readonly session = this.sessionState.asReadonly();
  readonly profile = this.profileState.asReadonly();
  readonly ready = this.readyState.asReadonly();
  readonly isAuthenticated = computed(() => this.sessionState() !== null);
  readonly isElder = computed(() => this.profileState()?.role === 'elder');
  // Elders are always treated as approved; members must be approved by an elder.
  readonly isApproved = computed(
    () => this.isElder() || this.profileState()?.membershipStatus === 'approved',
  );
  // Mirrors the required fields enforced in Profile's save() -- keep in sync.
  // Elders have no profile page, so they're exempt.
  readonly isProfileComplete = computed(() => {
    if (this.isElder()) {
      return true;
    }
    const profile = this.profileState();
    return !!(profile?.name?.trim() && profile.cityAddress?.trim() && profile.mobile?.trim());
  });

  private readonly readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.initialize();
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  async signInWithPassword(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (!error && data.session) {
      // Resolve the profile (role, membership status) before returning so callers
      // navigate only once guards like elderGuard/memberOnlyGuard see the real role.
      await this.applySession(data.session);
    }
    return { error: error?.message ?? null };
  }

  async signUp(email: string, password: string, name: string): Promise<SignUpResult> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: { data: { name: toProperCase(name) } },
    });
    if (!error && data.session) {
      // Same reasoning as signInWithPassword -- also covers AUTO_ADMIN promotion,
      // which adds a server round-trip that made this race much more visible.
      await this.applySession(data.session);
    }
    return { error: error?.message ?? null, needsEmailConfirmation: !error && !data.session };
  }

  async signInWithGoogle(): Promise<AuthResult> {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
        // Always show Google's account picker instead of silently reusing the
        // currently signed-in Google account.
        queryParams: { prompt: 'select_account' },
      },
    });
    return { error: error?.message ?? null };
  }

  async requestPasswordReset(email: string): Promise<AuthResult> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  }

  async updatePassword(newPassword: string): Promise<AuthResult> {
    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  }

  async signOut(): Promise<void> {
    // Local scope clears the client session/storage without a server revoke call,
    // which can throw on an already-stale token and silently abort sign-out.
    try {
      await this.supabase.auth.signOut({ scope: 'local' });
    } catch {
      // Ignore — we clear local state below regardless.
    }
    this.sessionState.set(null);
    this.profileState.set(null);
  }

  async updateProfileBasics(basics: ProfileBasics): Promise<AuthResult> {
    const userId = this.sessionState()?.user.id;
    if (!userId) {
      return { error: 'Not signed in' };
    }

    const name = toProperCase(basics.name);
    const { error } = await this.supabase
      .from('users')
      .update({
        name,
        date_of_birth: basics.dateOfBirth,
        gender: basics.gender,
        church: basics.church,
        city_address: basics.cityAddress,
        mobile: basics.mobile,
      })
      .eq('id', userId);
    if (error) {
      return { error: error.message };
    }

    const profile = this.profileState();
    if (profile) {
      this.profileState.set({ ...profile, ...basics, name });
    }
    return { error: null };
  }

  async updateThemePreference(themePreference: AppUser['themePreference']): Promise<AuthResult> {
    const userId = this.sessionState()?.user.id;
    if (!userId) {
      return { error: 'Not signed in' };
    }

    const { error } = await this.supabase.from('users').update({ theme_preference: themePreference }).eq('id', userId);
    if (error) {
      return { error: error.message };
    }

    const profile = this.profileState();
    if (profile) {
      this.profileState.set({ ...profile, themePreference });
    }
    return { error: null };
  }

  async updateNotificationPreferences(preferences: NotificationPreferences): Promise<AuthResult> {
    const userId = this.sessionState()?.user.id;
    if (!userId) {
      return { error: 'Not signed in' };
    }

    const { error } = await this.supabase
      .from('users')
      .update({
        notify_new_members: preferences.notifyNewMembers,
        notify_prayer_requests: preferences.notifyPrayerRequests,
        notify_new_testimonies: preferences.notifyNewTestimonies,
        notify_counseling_requests: preferences.notifyCounselingRequests,
      })
      .eq('id', userId);
    if (error) {
      return { error: error.message };
    }

    const profile = this.profileState();
    if (profile) {
      this.profileState.set({ ...profile, notificationPreferences: preferences });
    }
    return { error: null };
  }

  async updateAvatarUrl(avatarUrl: string): Promise<AuthResult> {
    const userId = this.sessionState()?.user.id;
    if (!userId) {
      return { error: 'Not signed in' };
    }

    const { error } = await this.supabase.from('users').update({ avatar_url: avatarUrl }).eq('id', userId);
    if (error) {
      return { error: error.message };
    }

    const profile = this.profileState();
    if (profile) {
      this.profileState.set({ ...profile, avatarUrl });
    }
    return { error: null };
  }

  async uploadAvatar(file: File): Promise<AuthResult> {
    const userId = this.sessionState()?.user.id;
    if (!userId) {
      return { error: 'Not signed in' };
    }

    // Random path per upload -- a fixed {userId}/avatar path made the public
    // URL guessable from a leaked user id alone (e.g. an "anonymous" elder
    // reply's responder_id), letting a member deanonymize the responder by
    // just loading their avatar. The old path is left orphaned in storage
    // rather than deleted -- harmless since avatar_url no longer points to it.
    const path = `${userId}/${crypto.randomUUID()}`;
    const { error: uploadError } = await this.supabase.storage
      .from('avatars')
      .upload(path, file, { contentType: file.type || 'image/jpeg' });

    if (uploadError) {
      return { error: uploadError.message };
    }

    const { data } = this.supabase.storage.from('avatars').getPublicUrl(path);
    return this.updateAvatarUrl(data.publicUrl);
  }

  private async initialize(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    await this.applySession(data.session);
    this.readyState.set(true);

    this.supabase.auth.onAuthStateChange((_event, session) => {
      void this.applySession(session);
    });
  }

  // Supabase's own onAuthStateChange listener fires (unawaited) for the same
  // session that signUp/signInWithPassword also apply explicitly below, so two
  // concurrent calls can land here for one sign-in. De-dupe by access token,
  // checked and set before any `await` so the two racing calls can't both pass
  // the guard -- otherwise both would hit provisionProfile's insert at once.
  // Track the in-flight promise (not just a "seen" flag) so whichever caller
  // needs the result -- e.g. signInWithPassword, awaited before navigation --
  // still gets it instead of racing an early no-op return.
  private inFlight: { token: string; promise: Promise<void> } | null = null;

  private applySession(session: Session | null): Promise<void> {
    const token = session?.access_token ?? null;
    if (token !== null && this.inFlight?.token === token) {
      return this.inFlight.promise;
    }
    const promise = this.doApplySession(session);
    this.inFlight = token !== null ? { token, promise } : null;
    return promise;
  }

  private async doApplySession(session: Session | null): Promise<void> {
    this.sessionState.set(session);

    if (!session) {
      this.profileState.set(null);
      return;
    }

    const profile = (await this.fetchProfile(session.user.id)) ?? (await this.provisionProfile(session));
    this.profileState.set(profile);
  }

  private async fetchProfile(userId: string): Promise<AppUser | null> {
    const { data } = await this.supabase
      .from('users')
      .select(
        'id, role, name, date_of_birth, gender, church, city_address, mobile, membership_status, theme_preference, avatar_url, branch_id, group_id, notify_new_members, notify_prayer_requests, notify_new_testimonies, notify_counseling_requests',
      )
      .eq('id', userId)
      .maybeSingle();

    return data ? this.toAppUser(data) : null;
  }

  private async provisionProfile(session: Session): Promise<AppUser | null> {
    const meta = session.user.user_metadata ?? {};
    const rawName = (meta['name'] as string | undefined) ?? (meta['full_name'] as string | undefined) ?? session.user.email ?? 'Member';
    const name = toProperCase(rawName);
    const avatarUrl = (meta['avatar_url'] as string | undefined) ?? (meta['picture'] as string | undefined) ?? null;

    const { data } = await this.supabase
      .from('users')
      .insert({ id: session.user.id, name, avatar_url: avatarUrl })
      .select(
        'id, role, name, date_of_birth, gender, church, city_address, mobile, membership_status, theme_preference, avatar_url, branch_id, group_id, notify_new_members, notify_prayer_requests, notify_new_testimonies, notify_counseling_requests',
      )
      .maybeSingle();

    if (!data) {
      return null;
    }

    const promoted = await this.checkAutoAdmin(session.access_token);
    if (promoted) {
      data['role'] = 'elder';
      data['membership_status'] = 'approved';
    } else {
      // Fire-and-forget: elders get emailed, but this never blocks or fails sign-up itself.
      // Skipped for auto-admins -- there's nothing for elders to review/approve.
      void this.notifyNewMember(session.access_token);
    }

    return this.toAppUser(data);
  }

  private async checkAutoAdmin(token: string): Promise<boolean> {
    try {
      const response = await fetch('/api/check-auto-admin', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json().catch(() => ({}))) as { promoted?: boolean };
      return !!data.promoted;
    } catch {
      return false;
    }
  }

  private async notifyNewMember(token: string): Promise<void> {
    try {
      await fetch('/api/notify-new-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
    } catch {
      // Non-fatal -- sign-up already succeeded.
    }
  }

  private toAppUser(data: Record<string, unknown>): AppUser {
    return {
      id: data['id'] as string,
      role: data['role'] as AppUser['role'],
      name: data['name'] as string,
      dateOfBirth: data['date_of_birth'] as string | null,
      gender: data['gender'] as AppUser['gender'],
      church: (data['church'] as string | null) ?? 'CCSGM Kawit',
      cityAddress: data['city_address'] as string | null,
      mobile: data['mobile'] as string | null,
      membershipStatus: (data['membership_status'] as AppUser['membershipStatus'] | null) ?? 'pending',
      themePreference: (data['theme_preference'] as AppUser['themePreference'] | null) ?? 'system',
      avatarUrl: data['avatar_url'] as string | null,
      notificationPreferences: {
        notifyNewMembers: (data['notify_new_members'] as boolean | null) ?? true,
        notifyPrayerRequests: (data['notify_prayer_requests'] as boolean | null) ?? true,
        notifyNewTestimonies: (data['notify_new_testimonies'] as boolean | null) ?? true,
        notifyCounselingRequests: (data['notify_counseling_requests'] as boolean | null) ?? true,
      },
      branchId: data['branch_id'] as string | null,
      groupId: data['group_id'] as string | null,
    };
  }
}
