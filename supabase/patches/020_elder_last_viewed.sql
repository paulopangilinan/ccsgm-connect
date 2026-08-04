-- Per-elder "last viewed" timestamps for the three admin tabs that use an
-- unread-style badge count (Prayer corner, Counseling, Testimonies). Members
-- still uses a genuinely-pending count (membership_status = 'pending'), which
-- is unaffected -- that badge should persist until acted on, not just viewed.

alter table users
  add column prayer_corner_viewed_at timestamptz,
  add column counseling_viewed_at timestamptz,
  add column testimonies_viewed_at timestamptz;
