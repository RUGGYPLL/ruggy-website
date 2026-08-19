-- Persistent switch for temporarily taking the public shop offline.
-- The public only needs to read this single non sensitive flag. Administrators
-- update it through the server side service role after authorization.

create table if not exists public.site_settings (
  id text primary key default 'global' check (id = 'global'),
  maintenance_mode boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id, maintenance_mode)
values ('global', false)
on conflict (id) do nothing;

alter table public.site_settings enable row level security;

revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;

drop policy if exists "Public can read maintenance mode" on public.site_settings;
create policy "Public can read maintenance mode"
  on public.site_settings
  for select
  to anon, authenticated
  using (id = 'global');
