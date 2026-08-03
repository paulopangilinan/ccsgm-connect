import { Service, inject } from '@angular/core';
import { SupabaseClientService } from '../supabase/supabase-client';
import { SessionService } from '../auth/session.service';
import { NewTestimony, Testimony } from './testimony';

interface ActionResult {
  error: string | null;
}

@Service()
export class TestimoniesService {
  private readonly supabase = inject(SupabaseClientService).client;
  private readonly session = inject(SessionService);

  async listMine(): Promise<Testimony[]> {
    const userId = this.session.session()?.user.id;
    if (!userId) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('testimonies')
      .select('id, linked_prayer_id, body, is_anonymous, share_to_website, created_at, testimony_media(url)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data.map((row) => ({
      id: row['id'] as string,
      linkedPrayerId: row['linked_prayer_id'] as string | null,
      body: row['body'] as string,
      isAnonymous: row['is_anonymous'] as boolean,
      shareToWebsite: row['share_to_website'] as boolean,
      createdAt: row['created_at'] as string,
      mediaUrls: ((row['testimony_media'] as { url: string }[] | null) ?? []).map((m) => m.url),
    }));
  }

  async create(input: NewTestimony): Promise<ActionResult> {
    const userId = this.session.session()?.user.id;
    if (!userId) {
      return { error: 'Not signed in' };
    }

    const { data, error } = await this.supabase
      .from('testimonies')
      .insert({
        user_id: userId,
        linked_prayer_id: input.linkedPrayerId,
        body: input.body,
        is_anonymous: input.isAnonymous,
        share_to_website: input.shareToWebsite,
      })
      .select('id')
      .single();

    if (error || !data) {
      return { error: error?.message ?? 'Failed to save testimony' };
    }

    const testimonyId = data['id'] as string;

    const urls: string[] = [];
    for (const [index, image] of input.images.entries()) {
      const path = `${userId}/${testimonyId}/${index}`;
      const { error: uploadError } = await this.supabase.storage
        .from('testimony-media')
        .upload(path, image, { upsert: true, contentType: image.type || 'image/jpeg' });
      if (uploadError) {
        return { error: uploadError.message };
      }
      const { data: publicUrl } = this.supabase.storage.from('testimony-media').getPublicUrl(path);
      urls.push(publicUrl.publicUrl);
    }

    if (urls.length > 0) {
      const { error: mediaError } = await this.supabase
        .from('testimony_media')
        .insert(urls.map((url) => ({ testimony_id: testimonyId, url })));
      if (mediaError) {
        return { error: mediaError.message };
      }
    }

    return { error: null };
  }
}
