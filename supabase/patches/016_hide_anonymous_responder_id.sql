-- Patch: stop leaking an "anonymous" elder's identity via responder_id.
--
-- submission_responses.responder_id is a NOT NULL FK, so it can't be nulled
-- on the row itself the way responder_name/responder_avatar_url already are
-- at write time. RLS only controls which ROWS a user can read, not which
-- COLUMNS -- so any member allowed to read a response row (i.e. it's on
-- their own submission) got the real responder_id back even when
-- is_anonymous = true. Combined with the avatars bucket being public at a
-- guessable {userId}/avatar path, this let a member deanonymize an "An
-- elder" reply by loading that user id's avatar directly (see also: avatar
-- path randomized in uploadAvatar()).
--
-- This view nulls responder_id for anonymous rows unless the viewer is an
-- elder (elders should always be able to see who on their team replied).
-- security_invoker is required -- see submissions_admin above for why.
-- Run in the Supabase SQL editor. Safe to re-run.

create or replace view submission_responses_visible
with (security_invoker = true)
as
select
  id,
  submission_id,
  case when is_anonymous and not is_elder() then null else responder_id end as responder_id,
  body,
  created_at,
  is_anonymous,
  responder_name,
  responder_avatar_url
from submission_responses;

grant select on submission_responses_visible to authenticated;
