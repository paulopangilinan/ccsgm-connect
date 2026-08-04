-- DESTRUCTIVE DEV UTILITY -- not a schema migration, do not run in production.
--
-- Wipes every account, member and elder alike, and everything tied to them:
-- deleting from auth.users cascades to public.users (users.id references
-- auth.users(id) on delete cascade), which in turn cascades to their
-- submissions, testimonies (+ media), question_answers, and birthday_greetings.
--
-- submission_responses.responder_id has no ON DELETE CASCADE (elders must
-- stay identifiable on replies even if the submission itself is gone), so it
-- won't clear via the auth.users cascade -- deleting an elder who has ever
-- replied to anything would hit a foreign key violation. Clear it explicitly
-- first so the auth.users delete has nothing left to conflict with.
--
-- After this, your own elder login is gone too. Sign up again with the same
-- email as before -- AUTO_ADMIN will auto-promote you back to elder+approved
-- on that first sign-up, same as it did the first time.
--
-- Run in the Supabase SQL editor only when you mean to wipe all test data.

delete from submission_responses;
delete from auth.users;
