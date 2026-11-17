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
