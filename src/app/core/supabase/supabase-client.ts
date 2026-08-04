import { Service } from '@angular/core';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

@Service()
export class SupabaseClientService {
  // sessionStorage (not localStorage) so the session ends when the tab/window
  // closes -- some of what members submit here (prayers, counsel) is
  // confidential, so a session shouldn't outlive the browser tab it started in.
  readonly client: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { storage: sessionStorage },
  });
}
