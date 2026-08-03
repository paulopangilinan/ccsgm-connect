import { Service } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

@Service()
export class SupabaseClientService {
  readonly client: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
