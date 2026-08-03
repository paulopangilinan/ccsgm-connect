-- CCSGM Connect schema (Supabase / Postgres)
-- Run in the Supabase SQL editor, top to bottom.

create extension if not exists "pgcrypto";

-- ─── Branches & groups ──────────────────────────────────────────────
-- Multi-branch is a future concern; only one branch/group ships at launch.

create table branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- ─── Users ───────────────────────────────────────────────────────────
-- 1:1 profile row per auth.users entry (Supabase Auth: Google OAuth + email/password).

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  branch_id uuid references branches(id),
  group_id uuid references groups(id),
  name text not null,
  date_of_birth date,
  gender text check (gender in ('male', 'female')),
  church text not null default 'CCSGM Kawit', -- single church at launch; catalog comes later
  city_address text,
  mobile text,
  avatar_url text,
  role text not null default 'member' check (role in ('member', 'elder')),
  -- New members await elder approval; elders are treated as always-approved in app code.
  membership_status text not null default 'pending' check (membership_status in ('pending', 'approved', 'rejected')),
  theme_preference text not null default 'system' check (theme_preference in ('light', 'dark', 'system')),

  -- Derived from the system-linked questionnaire questions (see `questions.system_key`).
  is_idaf_leader boolean not null default false,
  wants_idaf boolean not null default false,
  cef_sector smallint check (cef_sector between 1 and 5),
  wants_cef boolean not null default false,

  created_at timestamptz not null default now()
);

-- ─── Questionnaire builder ──────────────────────────────────────────
-- Elder-editable/addable questions. `system_linked` questions drive role/flag
-- assignment in app code via `system_key`; their labels/options/follow-up
-- links are still admin-editable, only the behavior is hardcoded.

create table questions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid references branches(id),
  type text not null default 'plain' check (type in ('plain', 'system_linked')),
  system_key text,
  label text not null,
  field_type text not null check (field_type in ('text', 'textarea', 'select', 'toggle', 'number')),
  options jsonb,
  parent_question_id uuid references questions(id) on delete cascade,
  trigger_value text,
  order_index int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table question_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  -- Nullable + set null (not cascade): a deleted question must not erase the
  -- member's answer to it. The answer stays, carrying its own question_snapshot.
  question_id uuid references questions(id) on delete set null,
  answer_value jsonb not null,
  -- Copy of the question (label/field_type/options) as it was when answered, so
  -- viewing an old answer shows the question the member actually saw, even after
  -- an elder edits or deletes it. { "label", "field_type", "options" }.
  question_snapshot jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);

-- System-linked question tree for IDAF/CEF (see users.is_idaf_leader etc. above).
do $$
declare
  idaf_question_id uuid;
  cef_question_id uuid;
begin
  insert into questions (type, system_key, label, field_type, order_index)
  values ('system_linked', 'idaf_status', 'Do you have IDAF?', 'toggle', 10)
  returning id into idaf_question_id;

  insert into questions (type, system_key, label, field_type, parent_question_id, trigger_value, order_index)
  values ('system_linked', 'wants_idaf', 'I want to join an IDAF', 'toggle', idaf_question_id, 'false', 11);

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
end $$;

-- ─── Submissions (prayer requests / counsel) ───────────────────────
-- Ongoing/repeatable. Testimonies used to live here too but now have their
-- own table (see below); the 'testimony' type is kept for legacy rows.
-- is_answered only applies to prayer_request rows.

create table submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in ('prayer_request', 'testimony', 'counsel_request')),
  body text not null,
  is_anonymous boolean not null default false,
  is_answered boolean not null default false,
  created_at timestamptz not null default now()
);

create table submission_responses (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  responder_id uuid not null references users(id),
  body text not null,
  -- When true, the member sees "An elder" instead of the responder's name.
  is_anonymous boolean not null default false,
  -- Denormalized responder name (null when anonymous). Members can't read an
  -- elder's users row via RLS, so the name is captured here at reply time.
  responder_name text,
  created_at timestamptz not null default now()
);

-- ─── Testimonies ────────────────────────────────────────────────────
-- Standalone, or tied to a prayer that was answered. Can carry images and be
-- shared to the public CCSGM website (integration later). When anonymous, the
-- displayed author becomes "A {age} years old {brother/sister} from {church}".

create table testimonies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  linked_prayer_id uuid references submissions(id) on delete set null,
  body text not null,
  is_anonymous boolean not null default false,
  share_to_website boolean not null default false,
  created_at timestamptz not null default now()
);

create table testimony_media (
  id uuid primary key default gen_random_uuid(),
  testimony_id uuid not null references testimonies(id) on delete cascade,
  url text not null,
  created_at timestamptz not null default now()
);

-- ─── Editable copy (consent clauses etc.) ───────────────────────────

create table content_snippets (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into content_snippets (key, value) values
  ('consent_clause_testimony', 'By typing here, you give consent to share your testimonies with the Elders of the church, and that information will be handled with strict confidentiality.'),
  ('consent_clause_counsel', '');

-- ─── Row Level Security ──────────────────────────────────────────────

create function is_elder()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from users where id = auth.uid() and role = 'elder'
  );
$$;

-- Blocks self-escalation: the "users update own row" policy lets members edit
-- their own row, but has no column restriction, so without this a member
-- could set their own role to 'elder' and pass straight through is_elder().
-- auth.uid() is only non-null for requests made through the app's own API
-- (PostgREST/GoTrue set the JWT claims); a direct DB session (Supabase SQL
-- editor, migrations) has no JWT and auth.uid() is null, so this only
-- restricts the app itself, not project-owner bootstrapping of the first elder.
create function protect_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not is_elder() then
    raise exception 'Only elders can change user roles';
  end if;
  return new;
end;
$$;

create trigger users_protect_role
  before update on users
  for each row execute function protect_user_role();

alter table branches enable row level security;
alter table groups enable row level security;
alter table users enable row level security;
alter table questions enable row level security;
alter table question_answers enable row level security;
alter table submissions enable row level security;
alter table submission_responses enable row level security;
alter table testimonies enable row level security;
alter table testimony_media enable row level security;
alter table content_snippets enable row level security;

create policy "branches readable by authenticated" on branches
  for select to authenticated using (true);

create policy "groups readable by authenticated" on groups
  for select to authenticated using (true);

create policy "users read own row" on users
  for select using (id = auth.uid() or is_elder());

create policy "users update own row" on users
  for update using (id = auth.uid());

-- Elders can update any user row (e.g. approve/reject membership). The
-- protect_user_role trigger still guards role changes separately.
create policy "users manageable by elders" on users
  for update using (is_elder()) with check (is_elder());

create policy "users insert own row" on users
  for insert with check (id = auth.uid());

create policy "questions readable by authenticated" on questions
  for select to authenticated using (true);

create policy "questions managed by elders" on questions
  for all using (is_elder()) with check (is_elder());

create policy "answers owned by user" on question_answers
  for select using (user_id = auth.uid() or is_elder());

create policy "answers written by owner" on question_answers
  for insert with check (user_id = auth.uid());

create policy "answers updated by owner" on question_answers
  for update using (user_id = auth.uid());

create policy "submissions owned by user" on submissions
  for select using (user_id = auth.uid() or is_elder());

create policy "submissions written by owner" on submissions
  for insert with check (user_id = auth.uid());

-- Lets a member mark their own prayer as answered.
create policy "submissions updated by owner" on submissions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "responses readable by submitter and elders" on submission_responses
  for select using (
    is_elder()
    or exists (select 1 from submissions s where s.id = submission_id and s.user_id = auth.uid())
  );

create policy "responses written by elders" on submission_responses
  for insert with check (is_elder());

create policy "testimonies readable by owner and elders" on testimonies
  for select using (user_id = auth.uid() or is_elder());

create policy "testimonies written by owner" on testimonies
  for insert with check (user_id = auth.uid());

create policy "testimonies updated by owner" on testimonies
  for update using (user_id = auth.uid());

create policy "testimonies deleted by owner" on testimonies
  for delete using (user_id = auth.uid());

create policy "testimony media readable by owner and elders" on testimony_media
  for select using (
    is_elder()
    or exists (select 1 from testimonies t where t.id = testimony_id and t.user_id = auth.uid())
  );

create policy "testimony media written by owner" on testimony_media
  for insert with check (
    exists (select 1 from testimonies t where t.id = testimony_id and t.user_id = auth.uid())
  );

create policy "content snippets readable by authenticated" on content_snippets
  for select to authenticated using (true);

create policy "content snippets managed by elders" on content_snippets
  for all using (is_elder()) with check (is_elder());

-- ─── Admin view: hides identity on anonymous submissions ────────────
-- security_invoker is required: without it, views run as their owner (the
-- Supabase SQL-editor role, which bypasses RLS), so ANY authenticated user
-- could read every submission through this view regardless of the
-- "submissions owned by user" policy on the underlying table.

create view submissions_admin
with (security_invoker = true)
as
select
  s.id,
  s.type,
  s.body,
  s.is_anonymous,
  s.created_at,
  case when s.is_anonymous then null else u.name end as submitted_by,
  case when s.is_anonymous then null else u.avatar_url end as submitted_by_avatar
from submissions s
join users u on u.id = s.user_id;

-- ─── Realtime ────────────────────────────────────────────────────────
-- Event-driven updates to elders: the admin UI subscribes to these tables via
-- Supabase Realtime. RLS still applies, so elders only receive rows they may read.

alter publication supabase_realtime add table users;
alter publication supabase_realtime add table submissions;
alter publication supabase_realtime add table testimonies;
