-- Patch: expand member profile basics (schema.sql users table).
-- Adds date_of_birth, gender, church, city_address and drops the raw age column
-- (age is now derived from date_of_birth in the app). Church defaults to the
-- single launch church; a church catalog comes later.
-- Run in the Supabase SQL editor. Safe to re-run.

alter table users add column if not exists date_of_birth date;
alter table users add column if not exists gender text check (gender in ('male', 'female'));
alter table users add column if not exists church text not null default 'CCSGM Kawit';
alter table users add column if not exists city_address text;
alter table users drop column if exists age;
