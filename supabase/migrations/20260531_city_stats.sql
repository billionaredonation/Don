alter table public.players
  add column if not exists health integer,
  add column if not exists food integer,
  add column if not exists water integer;

alter table public.player_positions
  add column if not exists health integer,
  add column if not exists food integer,
  add column if not exists water integer;

update public.players
set
  health = least(100, greatest(0, coalesce(health, 100))),
  food = least(100, greatest(0, coalesce(food, 100))),
  water = least(100, greatest(0, coalesce(water, 100)));

update public.player_positions
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

alter table public.player_positions
  alter column health set default 100,
  alter column food set default 100,
  alter column water set default 100,
  alter column health set not null,
  alter column food set not null,
  alter column water set not null;

update public.player_positions pp
set
  health = p.health,
  food = p.food,
  water = p.water
from public.players p
where pp.player_id = 'tg_' || p.tg_id::text;

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

  if not exists (
    select 1 from pg_constraint where conname = 'player_positions_health_range'
  ) then
    alter table public.player_positions
      add constraint player_positions_health_range check (health between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'player_positions_food_range'
  ) then
    alter table public.player_positions
      add constraint player_positions_food_range check (food between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'player_positions_water_range'
  ) then
    alter table public.player_positions
      add constraint player_positions_water_range check (water between 0 and 100);
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

  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  )
  and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'player_positions'
  ) then
    alter publication supabase_realtime add table public.player_positions;
  end if;
end $$;

create or replace function public.mn_sync_player_vitals_to_positions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.player_positions
  set
    health = new.health,
    food = new.food,
    water = new.water
  where player_id = 'tg_' || new.tg_id::text;

  return new;
end;
$$;

drop trigger if exists mn_players_vitals_to_positions on public.players;

create trigger mn_players_vitals_to_positions
after insert or update of health, food, water on public.players
for each row
execute function public.mn_sync_player_vitals_to_positions();
