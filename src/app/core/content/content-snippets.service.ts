import { Service, inject } from '@angular/core';
import { SupabaseClientService } from '../supabase/supabase-client';

@Service()
export class ContentSnippetsService {
  private readonly supabase = inject(SupabaseClientService).client;

  async get(key: string): Promise<string> {
    const { data } = await this.supabase
      .from('content_snippets')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    return (data?.['value'] as string | undefined) ?? '';
  }
}
