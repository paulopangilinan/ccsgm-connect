-- Elder review + website sync tracking for testimonies opted in to
-- share_to_website. Review is a new gate: an elder must approve inside
-- ccsgm-connect before api/publish-testimony-to-website.ts calls
-- ccsgm-website to create a Sanity draft. Sync columns let a failed push
-- be retried without re-approving, and expose the resulting draft id.

alter table testimonies
  add column website_review_status text
    check (website_review_status in ('pending', 'approved', 'rejected')),
  add column website_review_note text,
  add column website_reviewed_by uuid references users(id) on delete set null,
  add column website_reviewed_at timestamptz,
  add column website_sync_status text not null default 'not_synced'
    check (website_sync_status in ('not_synced', 'synced', 'failed')),
  add column website_post_id text,
  add column website_sync_error text,
  add column website_synced_at timestamptz;

-- Review status is only meaningful once a member has opted in to sharing.
alter table testimonies
  add constraint testimonies_review_status_requires_share
  check (not share_to_website or website_review_status is not null);

-- Backfill: any testimony that already had share_to_website = true before
-- this migration starts life in the review queue as pending.
update testimonies
  set website_review_status = 'pending'
  where share_to_website = true and website_review_status is null;

-- Elders can set review/sync columns on ANY testimony, not just their own
-- (mirrors "users manageable by elders"). api/publish-testimony-to-website.ts
-- writes its own sync-status updates through the service-role admin client
-- (bypasses RLS entirely) -- this policy exists for the elder's direct
-- Approve/Reject click, which updates the row straight from the browser.
create policy "testimonies manageable by elders" on testimonies
  for update using (is_elder()) with check (is_elder());
