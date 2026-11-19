-- Home inventory schema. Run once in Supabase SQL Editor.

create table if not exists allowed_users (
  email text primary key
);

create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from allowed_users
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create table if not exists locations (
  id bigint generated always as identity primary key,
  name text not null unique,
  sort_order int not null default 0
);

create table if not exists categories (
  id bigint generated always as identity primary key,
  name text not null unique,
  sort_order int not null default 0
);

create table if not exists items (
  id bigint generated always as identity primary key,
  name text not null,
  aliases text[] not null default '{}',
  category_id bigint references categories(id) on delete set null,
  location_id bigint references locations(id) on delete set null,
  quantity numeric not null default 0 check (quantity >= 0),
  target_quantity numeric not null default 0 check (target_quantity >= 0),
  package_size text,
  expiry_date date,
  opened_at date,
  open_shelf_days int check (open_shelf_days is null or open_shelf_days > 0),
  notes text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid()
);
create unique index if not exists items_name_unique on items (lower(name));

create table if not exists shopping_extras (
  id bigint generated always as identity primary key,
  name text not null,
  quantity numeric not null default 1,
  item_id bigint references items(id) on delete cascade,
  checked boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists stock_log (
  id bigint generated always as identity primary key,
  item_id bigint references items(id) on delete cascade,
  delta numeric not null,
  reason text not null check (reason in ('use','buy','count','edit','discard')),
  user_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace function touch_updated() returns trigger language plpgsql as $$
begin new.updated_at = now(); new.updated_by = auth.uid(); return new; end $$;
drop trigger if exists items_touch on items;
create trigger items_touch before update on items for each row execute function touch_updated();

-- Row level security: only allowed emails can read or write anything.
alter table allowed_users enable row level security;
alter table locations enable row level security;
alter table categories enable row level security;
alter table items enable row level security;
alter table shopping_extras enable row level security;
alter table stock_log enable row level security;

do $$
declare t text;
begin
  foreach t in array array['locations','categories','items','shopping_extras','stock_log'] loop
    execute format('drop policy if exists members_all on %I', t);
    execute format('create policy members_all on %I for all to authenticated using (is_member()) with check (is_member())', t);
  end loop;
end $$;

-- Realtime sync between devices
do $$
begin
  begin alter publication supabase_realtime add table items; exception when others then null; end;
  begin alter publication supabase_realtime add table shopping_extras; exception when others then null; end;
  begin alter publication supabase_realtime add table locations; exception when others then null; end;
  begin alter publication supabase_realtime add table categories; exception when others then null; end;
end $$;

-- Defaults
insert into locations (name, sort_order) values
  ('מקרר',1),('מקפיא',2),('מזווה',3),('ארון ניקיון',4),('אמבטיה',5)
on conflict (name) do nothing;

insert into categories (name, sort_order) values
  ('מוצרי חלב',1),('ירקות ופירות',2),('בשר ודגים',3),('יבשים',4),('שימורים',5),
  ('רטבים ותבלינים',6),('משקאות',7),('חטיפים',8),('ניקיון',9),('היגיינה',10),('כללי',11)
on conflict (name) do nothing;

-- Replace with your two emails:
-- insert into allowed_users (email) values ('you@example.com'), ('partner@example.com');

-- Members can see and manage the household's allowed emails from the app.
alter table allowed_users drop constraint if exists allowed_users_lower;
update allowed_users set email = lower(trim(email));
alter table allowed_users add constraint allowed_users_lower check (email = lower(trim(email)));
alter table allowed_users add column if not exists added_at timestamptz not null default now();

drop policy if exists members_select on allowed_users;
drop policy if exists members_insert on allowed_users;
drop policy if exists members_delete on allowed_users;
create policy members_select on allowed_users for select to authenticated using (is_member());
create policy members_insert on allowed_users for insert to authenticated with check (is_member());
create policy members_delete on allowed_users for delete to authenticated using (is_member());

grant execute on function is_member() to authenticated;

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

-- Recipes library (phase 2)
create table if not exists recipes (
  id bigint generated always as identity primary key,
  title text not null,
  source_url text,
  image_url text,
  rating numeric,
  rating_count int,
  servings text,
  total_time text,
  ingredients text[] not null default '{}',
  instructions text,
  notes text,
  cooked_count int not null default 0,
  last_cooked_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create unique index if not exists recipes_source_unique on recipes (source_url) where source_url is not null;

alter table recipes enable row level security;
drop policy if exists members_all on recipes;
create policy members_all on recipes for all to authenticated using (is_member()) with check (is_member());

do $$ begin
  begin alter publication supabase_realtime add table recipes; exception when others then null; end;
end $$;

-- Items the household wants to use soon; recipes that use them rank higher.
alter table items add column if not exists cook_soon boolean not null default false;
