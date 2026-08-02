-- Player metabolism, hydration-aware stamina support and reusable consumables.
-- All mutations are service-role only and are called through the verified
-- hospital-warehouse Edge Function.

create table if not exists public.player_consumable_catalog (
  item_type text primary key,
  label text not null,
  icon text not null default '□',
  price bigint not null default 0 check (price >= 0),
  food_restore integer not null default 0 check (food_restore >= 0),
  water_restore integer not null default 0 check (water_restore >= 0),
  store_key text not null default 'hospital_cafeteria',
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.player_consumable_inventory (
  player_tg_id text not null,
  item_type text not null references public.player_consumable_catalog(item_type) on delete restrict,
  quantity bigint not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (player_tg_id, item_type)
);

create table if not exists public.player_survival_state (
  player_tg_id text primary key,
  last_metabolism_at timestamptz not null default now(),
  critical_since timestamptz,
  last_damage_at timestamptz,
  last_notification_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Compatibility with an earlier consumables draft. CREATE TABLE IF NOT EXISTS
-- leaves an already existing table untouched, so every column used below must
-- also be added explicitly before the seed INSERT and RPC definitions.
alter table public.player_consumable_catalog
  add column if not exists label text not null default 'Расходник',
  add column if not exists icon text not null default '□',
  add column if not exists price bigint not null default 0,
  add column if not exists food_restore integer not null default 0,
  add column if not exists water_restore integer not null default 0,
  add column if not exists store_key text not null default 'hospital_cafeteria',
  add column if not exists enabled boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

alter table public.player_consumable_inventory
  add column if not exists quantity bigint not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.player_survival_state
  add column if not exists last_metabolism_at timestamptz not null default now(),
  add column if not exists critical_since timestamptz,
  add column if not exists last_damage_at timestamptz,
  add column if not exists last_notification_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists players_tg_id_text_survival_idx
on public.players ((tg_id::text));

create index if not exists players_lower_nickname_survival_idx
on public.players (lower(nickname));

alter table public.player_consumable_catalog enable row level security;
alter table public.player_consumable_inventory enable row level security;
alter table public.player_survival_state enable row level security;

revoke all on table public.player_consumable_catalog from public, anon, authenticated;
revoke all on table public.player_consumable_inventory from public, anon, authenticated;
revoke all on table public.player_survival_state from public, anon, authenticated;
grant select, insert, update, delete on table public.player_consumable_catalog to service_role;
grant select, insert, update, delete on table public.player_consumable_inventory to service_role;
grant select, insert, update, delete on table public.player_survival_state to service_role;

insert into public.player_consumable_catalog (
  item_type,
  label,
  icon,
  price,
  food_restore,
  water_restore,
  store_key,
  enabled
)
values ('water_bottle', 'Бутылка воды', '💧', 50, 0, 20, 'hospital_cafeteria', true)
on conflict (item_type) do update
set label = excluded.label,
    icon = excluded.icon,
    food_restore = excluded.food_restore,
    water_restore = excluded.water_restore,
    store_key = excluded.store_key,
    enabled = true,
    updated_at = now();

create or replace function public.mn_player_medicine_metabolic_cost(p_medicine_type text)
returns table(food_cost integer, water_cost integer)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  case p_medicine_type
    when 'medicine_light' then
      food_cost := 1 + floor(random() * 2)::integer;
      water_cost := 3 + floor(random() * 2)::integer;
    when 'medicine_strong' then
      food_cost := 3 + floor(random() * 3)::integer;
      water_cost := 5 + floor(random() * 3)::integer;
    when 'medicine_resuscitation' then
      food_cost := 10 + floor(random() * 3)::integer;
      water_cost := 8 + floor(random() * 11)::integer;
    else
      raise exception using message = 'INVALID_MEDICINE_REQUEST';
  end case;

  return next;
end;
$$;

revoke all on function public.mn_player_medicine_metabolic_cost(text) from public, anon, authenticated, service_role;

create or replace function public.player_apply_medicine_with_metabolic_cost(
  p_actor_tg_id text,
  p_medicine_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  applied jsonb;
  next_health numeric;
  next_food numeric;
  next_water numeric;
  food_cost integer;
  water_cost integer;
begin
  select p.health, p.food, p.water
  into next_health, next_food, next_water
  from public.players as p
  where p.tg_id::text = p_actor_tg_id
  for update;

  if not found then raise exception using message = 'PLAYER_NOT_FOUND'; end if;
  if coalesce(next_food, 0) < 40 then raise exception using message = 'PLAYER_FOOD_TOO_LOW'; end if;
  if coalesce(next_water, 0) < 40 then raise exception using message = 'PLAYER_WATER_TOO_LOW'; end if;

  select cost.food_cost, cost.water_cost
  into food_cost, water_cost
  from public.mn_player_medicine_metabolic_cost(p_medicine_type) as cost;

  applied := to_jsonb(public.player_use_medicine(p_actor_tg_id, p_medicine_type));
  if applied is null then raise exception using message = 'TREATMENT_APPLY_FAILED'; end if;

  update public.players as p
  set food = greatest(0, coalesce(p.food, 100) - food_cost),
      water = greatest(0, coalesce(p.water, 100) - water_cost),
      updated_at = now()
  where p.tg_id::text = p_actor_tg_id
  returning p.health, p.food, p.water into next_health, next_food, next_water;

  return applied || jsonb_build_object(
    'health', next_health,
    'food', next_food,
    'water', next_water,
    'foodCost', food_cost,
    'waterCost', water_cost,
    'metabolicCostApplied', true
  );
end;
$$;

revoke all on function public.player_apply_medicine_with_metabolic_cost(text, text) from public, anon, authenticated;
grant execute on function public.player_apply_medicine_with_metabolic_cost(text, text) to service_role;

create or replace function public.player_use_inventory_item_with_metabolic_cost(
  p_actor_tg_id text,
  p_item_type text,
  p_source text default 'personal',
  p_hospital_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  applied jsonb;
  next_health numeric;
  next_food numeric;
  next_water numeric;
  food_cost integer;
  water_cost integer;
begin
  select p.health, p.food, p.water
  into next_health, next_food, next_water
  from public.players as p
  where p.tg_id::text = p_actor_tg_id
  for update;

  if not found then raise exception using message = 'PLAYER_NOT_FOUND'; end if;
  if coalesce(next_food, 0) < 40 then raise exception using message = 'PLAYER_FOOD_TOO_LOW'; end if;
  if coalesce(next_water, 0) < 40 then raise exception using message = 'PLAYER_WATER_TOO_LOW'; end if;

  select cost.food_cost, cost.water_cost
  into food_cost, water_cost
  from public.mn_player_medicine_metabolic_cost(p_item_type) as cost;

  applied := to_jsonb(public.player_use_inventory_item(
    p_actor_tg_id,
    p_item_type,
    coalesce(nullif(btrim(p_source), ''), 'personal'),
    p_hospital_id
  ));
  if applied is null then raise exception using message = 'TREATMENT_APPLY_FAILED'; end if;

  update public.players as p
  set food = greatest(0, coalesce(p.food, 100) - food_cost),
      water = greatest(0, coalesce(p.water, 100) - water_cost),
      updated_at = now()
  where p.tg_id::text = p_actor_tg_id
  returning p.health, p.food, p.water into next_health, next_food, next_water;

  return applied || jsonb_build_object(
    'health', next_health,
    'food', next_food,
    'water', next_water,
    'foodCost', food_cost,
    'waterCost', water_cost,
    'metabolicCostApplied', true
  );
end;
$$;

revoke all on function public.player_use_inventory_item_with_metabolic_cost(text, text, text, text) from public, anon, authenticated;
grant execute on function public.player_use_inventory_item_with_metabolic_cost(text, text, text, text) to service_role;

create or replace function public.hospital_treat_player_with_metabolic_cost(
  p_hospital_id text,
  p_actor_tg_id text,
  p_target text,
  p_medicine_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  applied jsonb;
  patient_tg_id text;
  next_health numeric;
  next_food numeric;
  next_water numeric;
  food_cost integer;
  water_cost integer;
begin
  select p.tg_id::text, p.health, p.food, p.water
  into patient_tg_id, next_health, next_food, next_water
  from public.players as p
  where p.tg_id::text = p_target or lower(p.nickname) = lower(p_target)
  order by case when p.tg_id::text = p_target then 0 else 1 end
  limit 1
  for update;

  if not found then raise exception using message = 'PLAYER_NOT_FOUND'; end if;
  if coalesce(next_food, 0) < 40 then raise exception using message = 'PATIENT_FOOD_TOO_LOW'; end if;
  if coalesce(next_water, 0) < 40 then raise exception using message = 'PATIENT_WATER_TOO_LOW'; end if;

  select cost.food_cost, cost.water_cost
  into food_cost, water_cost
  from public.mn_player_medicine_metabolic_cost(p_medicine_type) as cost;

  applied := to_jsonb(public.hospital_treat_player(
    p_hospital_id,
    p_actor_tg_id,
    p_target,
    p_medicine_type
  ));
  if applied is null then raise exception using message = 'TREATMENT_APPLY_FAILED'; end if;

  update public.players as p
  set food = greatest(0, coalesce(p.food, 100) - food_cost),
      water = greatest(0, coalesce(p.water, 100) - water_cost),
      updated_at = now()
  where p.tg_id::text = patient_tg_id
  returning p.health, p.food, p.water into next_health, next_food, next_water;

  return applied || jsonb_build_object(
    'patientTgId', patient_tg_id,
    'health', next_health,
    'food', next_food,
    'water', next_water,
    'foodCost', food_cost,
    'waterCost', water_cost,
    'metabolicCostApplied', true
  );
end;
$$;

revoke all on function public.hospital_treat_player_with_metabolic_cost(text, text, text, text) from public, anon, authenticated;
grant execute on function public.hospital_treat_player_with_metabolic_cost(text, text, text, text) to service_role;

-- Replace the professional self-treatment wrapper so service stock follows the
-- same metabolic rules as personal inventory.
create or replace function public.hospital_use_own_inventory_medicine(
  p_hospital_id text,
  p_actor_tg_id text,
  p_item_type text,
  p_source text default 'service'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  applied jsonb;
  professional_stats jsonb;
begin
  applied := public.player_use_inventory_item_with_metabolic_cost(
    p_actor_tg_id,
    p_item_type,
    coalesce(nullif(btrim(p_source), ''), 'service'),
    p_hospital_id
  );

  professional_stats := public.hospital_increment_professional_treatment_stat(
    p_hospital_id,
    p_actor_tg_id
  );

  return applied || jsonb_build_object(
    'hospitalId', p_hospital_id,
    'professionalStats', professional_stats
  );
end;
$$;

revoke all on function public.hospital_use_own_inventory_medicine(text, text, text, text) from public, anon, authenticated;
grant execute on function public.hospital_use_own_inventory_medicine(text, text, text, text) to service_role;

-- Replace paid doctor treatment so charging, medicine consumption, metabolic
-- cost and effect start still roll back together on any error.
create or replace function public.hospital_treat_player_for_price(
  p_hospital_id text,
  p_actor_tg_id text,
  p_target text,
  p_medicine_type text,
  p_price bigint default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  issued jsonb;
  applied jsonb;
  patient_tg_id text;
begin
  if p_price is null or p_price < 0 or p_price > 1000000000 then
    raise exception using message = 'INVALID_TREATMENT_PRICE';
  end if;

  issued := to_jsonb(public.hospital_issue_medicine(
    p_hospital_id,
    p_actor_tg_id,
    p_target,
    p_medicine_type,
    p_price
  ));
  if issued is null then raise exception using message = 'TREATMENT_ISSUE_FAILED'; end if;

  patient_tg_id := nullif(coalesce(
    issued ->> 'patientTgId',
    issued ->> 'patient_tg_id',
    issued ->> 'patientTelegramId',
    issued ->> 'patient_telegram_id'
  ), '');
  if patient_tg_id is null then raise exception using message = 'PLAYER_NOT_FOUND'; end if;
  if patient_tg_id = p_actor_tg_id then raise exception using message = 'SELF_TREATMENT_USE_INVENTORY'; end if;

  begin
    applied := public.player_apply_medicine_with_metabolic_cost(patient_tg_id, p_medicine_type);
  exception
    when others then
      if position('PLAYER_FOOD_TOO_LOW' in sqlerrm) > 0 then
        raise exception using message = 'PATIENT_FOOD_TOO_LOW';
      elsif position('PLAYER_WATER_TOO_LOW' in sqlerrm) > 0 then
        raise exception using message = 'PATIENT_WATER_TOO_LOW';
      else
        raise;
      end if;
  end;

  return jsonb_strip_nulls(
    issued || applied || jsonb_build_object(
      'medicineApplied', true,
      'treatment', applied,
      'patientTgId', patient_tg_id
    )
  );
end;
$$;

revoke all on function public.hospital_treat_player_for_price(text, text, text, text, bigint) from public, anon, authenticated;
grant execute on function public.hospital_treat_player_for_price(text, text, text, text, bigint) to service_role;

create or replace function public.player_get_consumable_catalog()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'items',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'itemType', catalog.item_type,
          'label', catalog.label,
          'icon', catalog.icon,
          'price', catalog.price,
          'foodRestore', catalog.food_restore,
          'waterRestore', catalog.water_restore,
          'storeKey', catalog.store_key
        ) order by catalog.item_type
      ),
      '[]'::jsonb
    )
  )
  from public.player_consumable_catalog as catalog
  where catalog.enabled = true;
$$;

revoke all on function public.player_get_consumable_catalog() from public, anon, authenticated;
grant execute on function public.player_get_consumable_catalog() to service_role;

create or replace function public.player_get_consumable_inventory(p_actor_tg_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'items',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'itemType', inventory.item_type,
          'label', catalog.label,
          'icon', catalog.icon,
          'quantity', inventory.quantity,
          'source', 'personal',
          'foodRestore', catalog.food_restore,
          'waterRestore', catalog.water_restore
        ) order by inventory.item_type
      ) filter (where inventory.quantity > 0),
      '[]'::jsonb
    )
  )
  from public.player_consumable_inventory as inventory
  join public.player_consumable_catalog as catalog on catalog.item_type = inventory.item_type
  where inventory.player_tg_id = p_actor_tg_id;
$$;

revoke all on function public.player_get_consumable_inventory(text) from public, anon, authenticated;
grant execute on function public.player_get_consumable_inventory(text) to service_role;

create or replace function public.player_buy_consumable_item(
  p_actor_tg_id text,
  p_item_type text,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  catalog_row public.player_consumable_catalog%rowtype;
  current_balance numeric;
  next_balance numeric;
  total_price numeric;
  next_quantity bigint;
begin
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception using message = 'INVALID_CAFETERIA_BUY_REQUEST';
  end if;

  select * into catalog_row
  from public.player_consumable_catalog
  where item_type = p_item_type and enabled = true;
  if not found then raise exception using message = 'CONSUMABLE_ITEM_NOT_FOUND'; end if;

  select p.balance into current_balance
  from public.players as p
  where p.tg_id::text = p_actor_tg_id
  for update;
  if not found then raise exception using message = 'PLAYER_NOT_FOUND'; end if;

  total_price := catalog_row.price * p_quantity;
  if coalesce(current_balance, 0) < total_price then
    raise exception using message = 'PLAYER_BALANCE_NOT_ENOUGH';
  end if;

  update public.players as p
  set balance = p.balance - total_price,
      updated_at = now()
  where p.tg_id::text = p_actor_tg_id
  returning p.balance into next_balance;

  insert into public.player_consumable_inventory as inventory(player_tg_id, item_type, quantity, updated_at)
  values (p_actor_tg_id, p_item_type, p_quantity, now())
  on conflict (player_tg_id, item_type) do update
  set quantity = inventory.quantity + excluded.quantity,
      updated_at = now()
  returning quantity into next_quantity;

  return jsonb_build_object(
    'itemType', catalog_row.item_type,
    'itemLabel', catalog_row.label,
    'quantity', p_quantity,
    'inventoryQuantity', next_quantity,
    'totalPrice', total_price,
    'balance', next_balance
  );
end;
$$;

revoke all on function public.player_buy_consumable_item(text, text, integer) from public, anon, authenticated;
grant execute on function public.player_buy_consumable_item(text, text, integer) to service_role;

create or replace function public.player_use_consumable_item(
  p_actor_tg_id text,
  p_item_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  catalog_row public.player_consumable_catalog%rowtype;
  next_health numeric;
  current_food numeric;
  current_water numeric;
  next_food numeric;
  next_water numeric;
  next_quantity bigint;
begin
  select * into catalog_row
  from public.player_consumable_catalog
  where item_type = p_item_type and enabled = true;
  if not found then raise exception using message = 'CONSUMABLE_ITEM_NOT_FOUND'; end if;

  select p.health, p.food, p.water
  into next_health, current_food, current_water
  from public.players as p
  where p.tg_id::text = p_actor_tg_id
  for update;
  if not found then raise exception using message = 'PLAYER_NOT_FOUND'; end if;

  next_health := coalesce(next_health, 100);
  current_food := coalesce(current_food, 100);
  current_water := coalesce(current_water, 100);

  if catalog_row.water_restore > 0 and coalesce(current_water, 100) >= 100 and catalog_row.food_restore = 0 then
    raise exception using message = 'PLAYER_WATER_FULL';
  end if;
  if catalog_row.food_restore > 0 and coalesce(current_food, 100) >= 100 and catalog_row.water_restore = 0 then
    raise exception using message = 'PLAYER_FOOD_FULL';
  end if;

  update public.player_consumable_inventory
  set quantity = quantity - 1,
      updated_at = now()
  where player_tg_id = p_actor_tg_id and item_type = p_item_type and quantity > 0
  returning quantity into next_quantity;
  if not found then raise exception using message = 'PLAYER_ITEM_NOT_ENOUGH'; end if;

  delete from public.player_consumable_inventory
  where player_tg_id = p_actor_tg_id and item_type = p_item_type and quantity <= 0;

  update public.players as p
  set food = least(100, coalesce(p.food, 100) + catalog_row.food_restore),
      water = least(100, coalesce(p.water, 100) + catalog_row.water_restore),
      updated_at = now()
  where p.tg_id::text = p_actor_tg_id
  returning p.health, p.food, p.water into next_health, next_food, next_water;

  if next_food >= 10 and next_water >= 15 then
    update public.player_survival_state
    set critical_since = null,
        last_damage_at = null,
        updated_at = now()
    where player_tg_id = p_actor_tg_id;
  end if;

  return jsonb_build_object(
    'itemType', catalog_row.item_type,
    'itemLabel', catalog_row.label,
    'quantity', greatest(0, next_quantity),
    'health', next_health,
    'food', next_food,
    'water', next_water,
    'foodRestored', catalog_row.food_restore,
    'waterRestored', catalog_row.water_restore
  );
end;
$$;

revoke all on function public.player_use_consumable_item(text, text) from public, anon, authenticated;
grant execute on function public.player_use_consumable_item(text, text) to service_role;

create or replace function public.player_apply_stamina_exhaustion(p_actor_tg_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := clock_timestamp();
  next_health numeric;
  next_food numeric;
  next_water numeric;
  food_cost integer := 1 + floor(random() * 2)::integer;
  water_cost integer := 3 + floor(random() * 3)::integer;
  survival_row public.player_survival_state%rowtype;
  notification_required boolean := false;
begin
  select p.health, p.food, p.water
  into next_health, next_food, next_water
  from public.players as p
  where p.tg_id::text = p_actor_tg_id
  for update;
  if not found then raise exception using message = 'PLAYER_NOT_FOUND'; end if;

  next_health := coalesce(next_health, 100);
  next_food := coalesce(next_food, 100);
  next_water := coalesce(next_water, 100);

  update public.players as p
  set food = greatest(0, coalesce(p.food, 100) - food_cost),
      water = greatest(0, coalesce(p.water, 100) - water_cost),
      updated_at = now_at
  where p.tg_id::text = p_actor_tg_id
  returning p.health, p.food, p.water into next_health, next_food, next_water;

  insert into public.player_survival_state(player_tg_id, last_metabolism_at, updated_at)
  values (p_actor_tg_id, now_at, now_at)
  on conflict (player_tg_id) do nothing;

  select * into survival_row
  from public.player_survival_state
  where player_tg_id = p_actor_tg_id
  for update;

  if next_food < 10 or next_water < 15 then
    if survival_row.critical_since is null then
      survival_row.critical_since := now_at;
      survival_row.last_damage_at := null;
    end if;
    if survival_row.last_notification_at is null or now_at - survival_row.last_notification_at >= interval '30 minutes' then
      notification_required := true;
      survival_row.last_notification_at := now_at;
    end if;
  else
    survival_row.critical_since := null;
    survival_row.last_damage_at := null;
  end if;

  update public.player_survival_state
  set critical_since = survival_row.critical_since,
      last_damage_at = survival_row.last_damage_at,
      last_notification_at = survival_row.last_notification_at,
      updated_at = now_at
  where player_tg_id = p_actor_tg_id;

  return jsonb_build_object(
    'health', next_health,
    'food', next_food,
    'water', next_water,
    'foodCost', food_cost,
    'waterCost', water_cost,
    'sprintBlocked', next_food < 10 or next_water < 15,
    'notificationRequired', notification_required
  );
end;
$$;

revoke all on function public.player_apply_stamina_exhaustion(text) from public, anon, authenticated;
grant execute on function public.player_apply_stamina_exhaustion(text) to service_role;

create or replace function public.player_process_survival_tick(
  p_actor_tg_id text,
  p_is_active boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  now_at timestamptz := clock_timestamp();
  survival_row public.player_survival_state%rowtype;
  next_health numeric;
  next_food numeric;
  next_water numeric;
  raw_intervals integer := 0;
  applied_intervals integer := 0;
  food_cost integer := 0;
  water_cost integer := 0;
  health_damage integer := 0;
  damage_ticks integer := 0;
  damage_anchor timestamptz;
  notification_required boolean := false;
  entered_critical boolean := false;
  tick_index integer;
begin
  select p.health, p.food, p.water
  into next_health, next_food, next_water
  from public.players as p
  where p.tg_id::text = p_actor_tg_id
  for update;
  if not found then raise exception using message = 'PLAYER_NOT_FOUND'; end if;

  next_health := coalesce(next_health, 100);
  next_food := coalesce(next_food, 100);
  next_water := coalesce(next_water, 100);

  insert into public.player_survival_state(player_tg_id, last_metabolism_at, updated_at)
  values (p_actor_tg_id, now_at, now_at)
  on conflict (player_tg_id) do nothing;

  select * into survival_row
  from public.player_survival_state
  where player_tg_id = p_actor_tg_id
  for update;

  raw_intervals := greatest(0, floor(extract(epoch from (now_at - survival_row.last_metabolism_at)) / 600)::integer);
  applied_intervals := least(raw_intervals, 6);

  if applied_intervals > 0 then
    for tick_index in 1..applied_intervals loop
      if p_is_active then
        food_cost := food_cost + 2 + floor(random() * 3)::integer;
        water_cost := water_cost + 3 + floor(random() * 4)::integer;
      else
        food_cost := food_cost + 1 + floor(random() * 3)::integer;
        water_cost := water_cost + 1 + floor(random() * 4)::integer;
      end if;
    end loop;

    update public.players as p
    set food = greatest(0, coalesce(p.food, 100) - food_cost),
        water = greatest(0, coalesce(p.water, 100) - water_cost),
        updated_at = now_at
    where p.tg_id::text = p_actor_tg_id
    returning p.health, p.food, p.water into next_health, next_food, next_water;

    -- A long offline gap is capped to one hour and then rebased. AFK time while
    -- the app remains open is still accounted for exactly, including 30 min.
    survival_row.last_metabolism_at := now_at;
  end if;

  if next_food < 10 or next_water < 15 then
    if survival_row.critical_since is null then
      survival_row.critical_since := now_at;
      survival_row.last_damage_at := null;
      entered_critical := true;
    end if;

    if survival_row.last_notification_at is null or now_at - survival_row.last_notification_at >= interval '30 minutes' then
      notification_required := true;
      survival_row.last_notification_at := now_at;
    end if;

    damage_anchor := greatest(
      coalesce(survival_row.last_damage_at, survival_row.critical_since + interval '1 minute'),
      survival_row.critical_since + interval '1 minute'
    );

    if now_at >= damage_anchor then
      damage_ticks := floor(extract(epoch from (now_at - damage_anchor)) / 30)::integer + 1;
      health_damage := least(greatest(0, floor(coalesce(next_health, 100))::integer), damage_ticks);

      update public.players as p
      set health = greatest(0, coalesce(p.health, 100) - health_damage),
          updated_at = now_at
      where p.tg_id::text = p_actor_tg_id
      returning p.health, p.food, p.water into next_health, next_food, next_water;

      survival_row.last_damage_at := damage_anchor + make_interval(secs => damage_ticks * 30);
    end if;
  else
    survival_row.critical_since := null;
    survival_row.last_damage_at := null;
  end if;

  update public.player_survival_state
  set last_metabolism_at = survival_row.last_metabolism_at,
      critical_since = survival_row.critical_since,
      last_damage_at = survival_row.last_damage_at,
      last_notification_at = survival_row.last_notification_at,
      updated_at = now_at
  where player_tg_id = p_actor_tg_id;

  return jsonb_build_object(
    'health', next_health,
    'food', next_food,
    'water', next_water,
    'foodCost', food_cost,
    'waterCost', water_cost,
    'metabolismIntervals', applied_intervals,
    'activeMode', p_is_active,
    'healthDamage', health_damage,
    'critical', next_food < 10 or next_water < 15,
    'enteredCritical', entered_critical,
    'sprintBlocked', next_food < 10 or next_water < 15,
    'notificationRequired', notification_required,
    'hospitalizationRequired', next_health <= 0,
    'nextPollMs', 30000
  );
end;
$$;

revoke all on function public.player_process_survival_tick(text, boolean) from public, anon, authenticated;
grant execute on function public.player_process_survival_tick(text, boolean) to service_role;

create or replace function public.player_retry_survival_notification(p_actor_tg_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.player_survival_state
  set last_notification_at = null,
      updated_at = now()
  where player_tg_id = p_actor_tg_id;
$$;

revoke all on function public.player_retry_survival_notification(text) from public, anon, authenticated;
grant execute on function public.player_retry_survival_notification(text) to service_role;

comment on table public.player_survival_state
is 'Server clock for ten-minute metabolism, one-minute critical grace period and 30-second HP damage.';

comment on table public.player_consumable_catalog
is 'Reusable consumable catalog for hospital cafeteria and future shop menus.';
