alter table public.site_settings
  add column if not exists booking_lead_days integer not null default 5;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'site_settings_booking_lead_days_check'
      and conrelid = 'public.site_settings'::regclass
  ) then
    alter table public.site_settings
      add constraint site_settings_booking_lead_days_check
      check (booking_lead_days between 1 and 30);
  end if;
end
$$;

comment on column public.site_settings.booking_lead_days is
  'Liczba najbliższych dni zablokowanych dla nowych terminów realizacji';
