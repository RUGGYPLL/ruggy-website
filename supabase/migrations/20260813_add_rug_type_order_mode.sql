-- Let every rug category choose between an Instagram quote and immediate
-- online checkout. Existing categories keep the behavior that was previously
-- hardcoded in lib/rug-order-mode.ts.

alter table public.rug_types
  add column if not exists order_mode text;

update public.rug_types
set order_mode = case
  when btrim(slug) in ('piwodywany', 'papadywany') then 'checkout'
  else 'quote'
end
where order_mode is null;

alter table public.rug_types
  alter column order_mode set default 'quote',
  alter column order_mode set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rug_types_order_mode_check'
      and conrelid = 'public.rug_types'::regclass
  ) then
    alter table public.rug_types
      add constraint rug_types_order_mode_check
      check (order_mode in ('quote', 'checkout'));
  end if;
end
$$;

comment on column public.rug_types.order_mode is
  'quote saves an Instagram quote request, checkout starts online payment';
