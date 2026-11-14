-- Keeps the free project active: a public function that only touches one heartbeat row.
create table if not exists heartbeat (
  id int primary key default 1 check (id = 1),
  pinged_at timestamptz not null default now()
);
alter table heartbeat enable row level security;
insert into heartbeat (id) values (1) on conflict do nothing;

create or replace function keepalive() returns timestamptz
language sql volatile security definer set search_path = public as $$
  update heartbeat set pinged_at = now() where id = 1 returning pinged_at;
$$;
revoke all on function keepalive() from public;
grant execute on function keepalive() to anon, authenticated;
