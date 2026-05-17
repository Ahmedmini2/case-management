-- Run once in the Supabase SQL editor to enable per-user font preference.
-- Safe to re-run: each statement is guarded with IF NOT EXISTS.

alter table public.users
  add column if not exists "fontPreference" text;

-- Optional: a comment for documentation.
comment on column public.users."fontPreference" is
  'Key of the font the user picked in Settings → Fonts (e.g. "inter", "cairo"). Null = use app default.';
