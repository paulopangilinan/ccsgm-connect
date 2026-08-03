import { Service, inject, signal } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseClientService } from '../supabase/supabase-client';

/**
 * Event-driven updates for elders. Subscribes to member activity via Supabase
 * Realtime (RLS still applies, so only elders receive rows they may read) and
 * exposes live signals the admin UI reacts to — no manual refresh.
 */
@Service()
export class NotificationsService {
  private readonly supabase = inject(SupabaseClientService).client;
  private channel: RealtimeChannel | null = null;

  /** Members awaiting approval. */
  readonly pendingCount = signal(0);
  /** Bumps on any new prayer/counsel/testimony so views can reload. */
  readonly activityTick = signal(0);

  start(): void {
    void this.refreshPendingCount();

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
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'testimonies' }, () => {
        this.activityTick.update((n) => n + 1);
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
}
