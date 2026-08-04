-- DESTRUCTIVE DEV UTILITY -- not a schema migration, do not run in production.
--
-- Wipes every member account (role = 'member') and everything tied to them:
-- deleting from auth.users cascades to public.users (users.id references
-- auth.users(id) on delete cascade), which in turn cascades to their
-- submissions, testimonies (+ media), question_answers, and birthday_greetings.
--
-- Elder accounts are left untouched.
--
-- Run in the Supabase SQL editor only when you mean to wipe test member data.

delete from auth.users
where id in (select id from public.users where role = 'member');
