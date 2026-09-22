alter table public.bookings
  alter column rug_type_id drop not null;

alter table public.bookings
  add column if not exists payment_kind text not null default 'catalog_order',
  add column if not exists project_reference text,
  add column if not exists whatsapp_notification_status text not null default 'not_sent',
  add column if not exists whatsapp_notification_error text,
  add column if not exists whatsapp_notification_sent_at timestamptz;

alter table public.bookings
  drop constraint if exists bookings_payment_kind_check;

alter table public.bookings
  add constraint bookings_payment_kind_check
  check (payment_kind in ('catalog_order', 'agreed_project_payment'));

alter table public.bookings
  drop constraint if exists bookings_whatsapp_notification_status_check;

alter table public.bookings
  add constraint bookings_whatsapp_notification_status_check
  check (whatsapp_notification_status in ('not_sent', 'sent', 'failed'));

comment on column public.bookings.payment_kind is
  'catalog_order is a configured rug order, agreed_project_payment is a payment for a project agreed outside the shop';

comment on column public.bookings.project_reference is
  'Customer supplied description identifying an agreed project payment';

comment on column public.bookings.whatsapp_notification_status is
  'Delivery state of the owner WhatsApp notification';

comment on column public.bookings.whatsapp_notification_error is
  'Last WhatsApp provider or configuration error, without secrets';
