import { Service, computed, inject, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { SupabaseClientService } from '../supabase/supabase-client';
import { AppUser, ProfileBasics } from './app-user';
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

  private readonly readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.initialize();
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  async signInWithPassword(email: string, password: string): Promise<AuthResult> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async signUp(email: string, password: string, name: string): Promise<SignUpResult> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: { data: { name: toProperCase(name) } },
    });
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

    // Fixed path per user so a new upload overwrites the old one (no orphans).
    const path = `${userId}/avatar`;
    const { error: uploadError } = await this.supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });

    if (uploadError) {
      return { error: uploadError.message };
    }

    const { data } = this.supabase.storage.from('avatars').getPublicUrl(path);
    // Cache-bust so the browser re-fetches after an overwrite at the same path.
    const url = `${data.publicUrl}?v=${Date.now()}`;
    return this.updateAvatarUrl(url);
  }

  private async initialize(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    await this.applySession(data.session);
    this.readyState.set(true);

    this.supabase.auth.onAuthStateChange((_event, session) => {
      void this.applySession(session);
    });
  }

  private async applySession(session: Session | null): Promise<void> {
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
      .select('id, role, name, date_of_birth, gender, church, city_address, mobile, membership_status, avatar_url, branch_id, group_id')
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
      .select('id, role, name, date_of_birth, gender, church, city_address, mobile, membership_status, avatar_url, branch_id, group_id')
      .maybeSingle();

    return data ? this.toAppUser(data) : null;
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
      avatarUrl: data['avatar_url'] as string | null,
      branchId: data['branch_id'] as string | null,
      groupId: data['group_id'] as string | null,
    };
  }
}
