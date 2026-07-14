alter table public.players
  add column if not exists health integer,
  add column if not exists food integer,
  add column if not exists water integer;

update public.players
set
  health = least(100, greatest(0, coalesce(health, 100))),
  food = least(100, greatest(0, coalesce(food, 100))),
  water = least(100, greatest(0, coalesce(water, 100)));

alter table public.players
  alter column health set default 100,
  alter column food set default 100,
  alter column water set default 100,
  alter column health set not null,
  alter column food set not null,
  alter column water set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'players_health_range'
  ) then
    alter table public.players
      add constraint players_health_range check (health between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'players_food_range'
  ) then
    alter table public.players
      add constraint players_food_range check (food between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'players_water_range'
  ) then
    alter table public.players
      add constraint players_water_range check (water between 0 and 100);
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  )
  and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'players'
  ) then
    alter publication supabase_realtime add table public.players;
  end if;
end $$;

create or replace function public.mn_broadcast_player_stats_changed()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  if
    old.balance is not distinct from new.balance and
    old.health is not distinct from new.health and
    old.food is not distinct from new.food and
    old.water is not distinct from new.water
  then
    return new;
  end if;

  perform realtime.broadcast_changes(
    'mn-player-balance:' || new.id::text,
    'balance_changed',
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );

  return new;
end;
$$;

drop trigger if exists mn_players_stats_realtime on public.players;

create trigger mn_players_stats_realtime
after update of balance, health, food, water on public.players
for each row
execute function public.mn_broadcast_player_stats_changed();
