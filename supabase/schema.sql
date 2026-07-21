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
-- 1:1 profile row per auth.users entry (Supabase Auth: Facebook OAuth + email/password).

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  branch_id uuid references branches(id),
  group_id uuid references groups(id),
  name text not null,
  age int,
  avatar_url text,
  role text not null default 'member' check (role in ('member', 'elder')),
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
  question_id uuid not null references questions(id) on delete cascade,
  answer_value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, question_id)
);

-- ─── Submissions (prayer requests / testimonies / counsel) ─────────
-- Unified table, ongoing/repeatable — not one-time-at-registration.

create table submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null check (type in ('prayer_request', 'testimony', 'counsel_request')),
  body text not null,
  is_anonymous boolean not null default false,
  created_at timestamptz not null default now()
);

create table submission_responses (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  responder_id uuid not null references users(id),
  body text not null,
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

alter table branches enable row level security;
alter table groups enable row level security;
alter table users enable row level security;
alter table questions enable row level security;
alter table question_answers enable row level security;
alter table submissions enable row level security;
alter table submission_responses enable row level security;
alter table content_snippets enable row level security;

create policy "branches readable by authenticated" on branches
  for select to authenticated using (true);

create policy "groups readable by authenticated" on groups
  for select to authenticated using (true);

create policy "users read own row" on users
  for select using (id = auth.uid() or is_elder());

create policy "users update own row" on users
  for update using (id = auth.uid());

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

create policy "responses readable by submitter and elders" on submission_responses
  for select using (
    is_elder()
    or exists (select 1 from submissions s where s.id = submission_id and s.user_id = auth.uid())
  );

create policy "responses written by elders" on submission_responses
  for insert with check (is_elder());

create policy "content snippets readable by authenticated" on content_snippets
  for select to authenticated using (true);

create policy "content snippets managed by elders" on content_snippets
  for all using (is_elder()) with check (is_elder());

-- ─── Admin view: hides identity on anonymous submissions ────────────

create view submissions_admin as
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
