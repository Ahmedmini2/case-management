-- Run once in the Supabase SQL editor.
-- Adds tag-based segmentation to contacts. A "segment" or "audience" in the UI
-- is simply a tag — pick a tag when sending a broadcast and every contact
-- carrying that tag becomes a recipient.
--
-- Safe to re-run.

alter table public.contacts
  add column if not exists tags text[] default '{}'::text[];

-- GIN index makes ANY/CONTAINS lookups on tags fast even with many contacts.
create index if not exists contacts_tags_gin_idx
  on public.contacts using gin (tags);

comment on column public.contacts.tags is
  'Free-form labels used for broadcast segmentation. Examples: "purchased", "newsletter", "vip".';
