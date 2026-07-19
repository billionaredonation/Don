-- Хранит два больничных пикапа отдельно от старого RPC маппинга интерьеров.
-- Это сохраняет полную совместимость с уже расставленными кроватями, дверями и мебелью.

create table if not exists public.hospital_interior_pickups (
  id text primary key,
  template_id text not null default 'hospital' check (template_id = 'hospital'),
  object_type text not null check (object_type in ('warehouse_refill', 'warehouse_take')),
  x numeric(6,2) not null check (x between 0 and 100),
  y numeric(6,2) not null check (y between 0 and 100),
  rotation integer not null default 0 check (rotation in (0, 90, 180, 270)),
  properties jsonb not null default '{}'::jsonb check (jsonb_typeof(properties) = 'object'),
  updated_by_tg_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists hospital_one_pickup_per_type
  on public.hospital_interior_pickups(template_id, object_type);

alter table public.hospital_interior_pickups enable row level security;

create or replace function public.hospital_get_pickup_layout(p_actor_tg_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pickups',
    coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'type', p.object_type,
      'x', p.x,
      'y', p.y,
      'rotation', p.rotation,
      'properties', p.properties
    ) order by p.object_type), '[]'::jsonb)
  )
  from public.hospital_interior_pickups p
  where p.template_id = 'hospital';
$$;

create or replace function public.hospital_save_pickup_layout(
  p_actor_tg_id text,
  p_pickups jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_id text;
  v_type text;
  v_x numeric(6,2);
  v_y numeric(6,2);
  v_rotation integer;
  v_properties jsonb;
begin
  if not public.hospital_player_is_admin(p_actor_tg_id) then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_pickups is null or jsonb_typeof(p_pickups) <> 'array' then
    raise exception 'PICKUP_LAYOUT_INVALID';
  end if;
  if jsonb_array_length(p_pickups) > 2 then
    raise exception 'PICKUP_LAYOUT_LIMIT';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_pickups) as item(value)
    group by item.value->>'type'
    having count(*) > 1
  ) then
    raise exception 'PICKUP_TYPE_DUPLICATE';
  end if;

  delete from public.hospital_interior_pickups where template_id = 'hospital';

  for v_item in select value from jsonb_array_elements(p_pickups)
  loop
    v_id := trim(coalesce(v_item->>'id', ''));
    v_type := trim(coalesce(v_item->>'type', ''));
    if v_id = '' or length(v_id) > 96 then raise exception 'PICKUP_ID_INVALID'; end if;
    if v_type not in ('warehouse_refill', 'warehouse_take') then raise exception 'PICKUP_TYPE_INVALID'; end if;

    begin
      v_x := (v_item->>'x')::numeric(6,2);
      v_y := (v_item->>'y')::numeric(6,2);
      v_rotation := coalesce((v_item->>'rotation')::integer, 0);
    exception when others then
      raise exception 'PICKUP_POSITION_INVALID';
    end;

    if v_x not between 0 and 100 or v_y not between 0 and 100 then
      raise exception 'PICKUP_POSITION_INVALID';
    end if;
    v_rotation := ((v_rotation % 360) + 360) % 360;
    if v_rotation not in (0, 90, 180, 270) then raise exception 'PICKUP_ROTATION_INVALID'; end if;

    v_properties := case
      when jsonb_typeof(v_item->'properties') = 'object' then v_item->'properties'
      else '{}'::jsonb
    end;

    insert into public.hospital_interior_pickups(
      id, template_id, object_type, x, y, rotation, properties, updated_by_tg_id
    ) values (
      v_id, 'hospital', v_type, v_x, v_y, v_rotation, v_properties, trim(p_actor_tg_id)
    );
  end loop;

  return public.hospital_get_pickup_layout(p_actor_tg_id);
end;
$$;

revoke all on table public.hospital_interior_pickups from anon, authenticated;
revoke all on function public.hospital_get_pickup_layout(text) from public, anon, authenticated;
revoke all on function public.hospital_save_pickup_layout(text, jsonb) from public, anon, authenticated;

grant execute on function public.hospital_get_pickup_layout(text) to service_role;
grant execute on function public.hospital_save_pickup_layout(text, jsonb) to service_role;
