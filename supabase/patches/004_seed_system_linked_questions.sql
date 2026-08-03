-- Patch: seed the IDAF and CEF system-linked questions.
-- These drive users.is_idaf_leader / wants_idaf / cef_sector / wants_cef (see
-- schema.sql's comment on the users table). The app code that interprets
-- system_key and writes those columns from an answer doesn't exist yet --
-- this only seeds the question tree itself, editable afterward from the
-- admin question builder (label/options/active), not its conditional wiring.
-- Run in the Supabase SQL editor. Safe to re-run (guarded by system_key checks).

do $$
declare
  idaf_question_id uuid;
  cef_question_id uuid;
begin
  if not exists (select 1 from questions where system_key = 'idaf_status') then
    insert into questions (type, system_key, label, field_type, order_index)
    values ('system_linked', 'idaf_status', 'Do you have IDAF?', 'toggle', 10)
    returning id into idaf_question_id;

    insert into questions (type, system_key, label, field_type, parent_question_id, trigger_value, order_index)
    values ('system_linked', 'wants_idaf', 'I want to join an IDAF', 'toggle', idaf_question_id, 'false', 11);
  end if;

  if not exists (select 1 from questions where system_key = 'cef_sector') then
    insert into questions (type, system_key, label, field_type, options, order_index)
    values (
      'system_linked',
      'cef_sector',
      'Which CEF Sector are you part of?',
      'select',
      '["Sector 1", "Sector 2", "Sector 3", "Sector 4", "Sector 5", "None yet"]'::jsonb,
      20
    )
    returning id into cef_question_id;

    insert into questions (type, system_key, label, field_type, parent_question_id, trigger_value, order_index)
    values ('system_linked', 'wants_cef', 'I want to join CEF', 'toggle', cef_question_id, 'None yet', 21);
  end if;
end $$;
