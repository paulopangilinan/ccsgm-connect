import { Service, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseClientService } from '../supabase/supabase-client';
import { SessionService } from '../auth/session.service';

type ViewedColumn = 'prayer_corner_viewed_at' | 'counseling_viewed_at' | 'testimonies_viewed_at';

/**
 * Event-driven updates for elders. Subscribes to member activity via Supabase
 * Realtime (RLS still applies, so only elders receive rows they may read) and
 * exposes live signals the admin UI reacts to — no manual refresh.
 */
@Service()
export class NotificationsService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly session = inject(SessionService);
  private channel: RealtimeChannel | null = null;

  /** Members awaiting approval -- a real pending state, unaffected by "viewed". */
  readonly pendingCount = signal(0);
  /** Testimonies shared since this elder last opened admin/testimonies. */
  readonly pendingTestimonyCount = signal(0);
  /** Prayer requests submitted since this elder last opened Prayer corner. */
  readonly pendingPrayerCount = signal(0);
  /** Counseling requests submitted since this elder last opened Counseling. */
  readonly pendingCounselCount = signal(0);
  /** Bumps on any new prayer/counsel/testimony so views can reload. */
  readonly activityTick = signal(0);

  start(): void {
    void this.refreshPendingCount();
    void this.refreshPendingTestimonyCount();
    void this.refreshPendingSubmissionCounts();

    if (this.channel) {
      return;
    }

    this.channel = this.supabase
      .channel('elder-notifications')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, () => {
        void this.refreshPendingCount();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'submissions' }, () => {
        this.activityTick.update((n) => n + 1);
        void this.refreshPendingSubmissionCounts();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'testimonies' }, () => {
        this.activityTick.update((n) => n + 1);
        void this.refreshPendingTestimonyCount();
      })
      .subscribe();
  }

  stop(): void {
    if (this.channel) {
      void this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
  }

  async refreshPendingCount(): Promise<void> {
    const { count } = await this.supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('membership_status', 'pending');
    this.pendingCount.set(count ?? 0);
  }

  async refreshPendingTestimonyCount(): Promise<void> {
    const viewedAt = await this.getOwnViewedAt('testimonies_viewed_at');
    let query = this.supabase
      .from('testimonies')
      .select('id', { count: 'exact', head: true })
      .eq('share_to_website', true);
    if (viewedAt) {
      query = query.gt('created_at', viewedAt);
    }
    const { count } = await query;
    this.pendingTestimonyCount.set(count ?? 0);
  }

  async refreshPendingSubmissionCounts(): Promise<void> {
    const [prayerViewedAt, counselViewedAt] = await Promise.all([
      this.getOwnViewedAt('prayer_corner_viewed_at'),
      this.getOwnViewedAt('counseling_viewed_at'),
    ]);
    const [prayerCount, counselCount] = await Promise.all([
      this.countSince('prayer_request', prayerViewedAt),
      this.countSince('counsel_request', counselViewedAt),
    ]);
    this.pendingPrayerCount.set(prayerCount);
    this.pendingCounselCount.set(counselCount);
  }

  async markPrayerCornerViewed(): Promise<void> {
    await this.setOwnViewedAt('prayer_corner_viewed_at');
    void this.refreshPendingSubmissionCounts();
  }

  async markCounselingViewed(): Promise<void> {
    await this.setOwnViewedAt('counseling_viewed_at');
    void this.refreshPendingSubmissionCounts();
  }

  async markTestimoniesViewed(): Promise<void> {
    await this.setOwnViewedAt('testimonies_viewed_at');
    void this.refreshPendingTestimonyCount();
  }

  private async countSince(type: 'prayer_request' | 'counsel_request', viewedAt: string | null): Promise<number> {
    let query = this.supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('type', type);
    if (viewedAt) {
      query = query.gt('created_at', viewedAt);
    }
    const { count } = await query;
    return count ?? 0;
  }

  private async getOwnViewedAt(column: ViewedColumn): Promise<string | null> {
    const userId = this.session.session()?.user.id;
    if (!userId) {
      return null;
    }
    const { data } = await this.supabase.from('users').select(column).eq('id', userId).maybeSingle();
    return ((data as Record<string, unknown> | null)?.[column] as string | null) ?? null;
  }

  private async setOwnViewedAt(column: ViewedColumn): Promise<void> {
    const userId = this.session.session()?.user.id;
    if (!userId) {
      return;
    }
    await this.supabase
      .from('users')
      .update({ [column]: new Date().toISOString() })
      .eq('id', userId);
  }
}
