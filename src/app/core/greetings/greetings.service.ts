import { Service, inject } from '@angular/core';
import { SupabaseClientService } from '../supabase/supabase-client';
import { SessionService } from '../auth/session.service';

interface ActionResult {
  error: string | null;
}

export interface Greeting {
  fromName: string;
  message: string;
  createdAt: string;
}

const RECENT_WINDOW_DAYS = 7;

@Service()
export class GreetingsService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly session = inject(SessionService);

  async sendProfileGreeting(memberId: string, message: string): Promise<ActionResult> {
    const fromName = this.session.profile()?.name ?? 'An elder';
    const { error } = await this.supabase
      .from('birthday_greetings')
      .insert({ user_id: memberId, from_name: fromName, message });
    return { error: error?.message ?? null };
  }

  async sendEmailGreeting(memberId: string): Promise<ActionResult> {
    return this.sendViaApi(memberId, 'email');
  }

  async sendSmsGreeting(memberId: string): Promise<ActionResult> {
    return this.sendViaApi(memberId, 'sms');
  }

  async listRecentForCurrentUser(): Promise<Greeting[]> {
    const userId = this.session.session()?.user.id;
    if (!userId) {
      return [];
    }

    const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await this.supabase
      .from('birthday_greetings')
      .select('from_name, message, created_at')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      fromName: row['from_name'] as string,
      message: row['message'] as string,
      createdAt: row['created_at'] as string,
    }));
  }

  private async sendViaApi(memberId: string, channel: 'email' | 'sms'): Promise<ActionResult> {
    const token = this.session.session()?.access_token;
    if (!token) {
      return { error: 'Not signed in' };
    }

    try {
      const response = await fetch('/api/greet-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ memberId, channel }),
      });
      const data = (await response.json().catch(() => ({}))) as { sent?: boolean; reason?: string; error?: string };
      if (!response.ok) {
        return { error: data.error ?? `Failed (${response.status})` };
      }
      if (!data.sent) {
        return {
          error:
            data.reason === 'no-mobile'
              ? 'Member has no mobile number on file'
              : data.reason === 'no-email'
                ? 'Member has no email on file'
                : (data.error ?? 'Not sent'),
        };
      }
      return { error: null };
    } catch {
      return { error: 'Could not reach the server.' };
    }
  }
}
