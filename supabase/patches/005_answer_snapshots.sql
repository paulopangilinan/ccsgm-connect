-- Patch: make member answers durable snapshots (schema.sql question_answers).
-- Two changes so a stored answer keeps showing the question the member actually
-- saw, even after an elder edits or deletes that question:
--   1. question_snapshot jsonb -- a copy of the question's label/field_type/options
--      captured at answer time (written by the app on each save).
--   2. question_id becomes nullable with ON DELETE SET NULL instead of CASCADE,
--      so deleting a question no longer deletes the answers to it.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table question_answers add column if not exists question_snapshot jsonb;

alter table question_answers alter column question_id drop not null;

alter table question_answers drop constraint if exists question_answers_question_id_fkey;

alter table question_answers
  add constraint question_answers_question_id_fkey
  foreign key (question_id) references questions(id) on delete set null;
