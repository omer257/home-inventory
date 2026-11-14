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
