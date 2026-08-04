-- Per-elder email notification preferences. Default true on every column so
-- existing behavior (all elders get all emails) is unchanged until an elder
-- opts out via admin/notifications.

alter table users
  add column notify_new_members boolean not null default true,
  add column notify_prayer_requests boolean not null default true,
  add column notify_new_testimonies boolean not null default true,
  add column notify_counseling_requests boolean not null default true;
