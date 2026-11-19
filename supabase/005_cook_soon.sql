-- Items the household wants to use soon; recipes that use them rank higher.
alter table items add column if not exists cook_soon boolean not null default false;
