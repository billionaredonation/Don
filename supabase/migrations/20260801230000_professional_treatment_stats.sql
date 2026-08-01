-- Persistent statistics for treatments performed through the professional
-- doctor subsystem, including a doctor applying a hospital medicine to self.

create table if not exists public.hospital_professional_treatment_stats (
  hospital_id text not null,
  employee_tg_id text not null,
  professional_treatments bigint not null default 0 check (professional_treatments >= 0),
  updated_at timestamptz not null default now(),
  primary key (hospital_id, employee_tg_id)
);

alter table public.hospital_professional_treatment_stats enable row level security;

revoke all on table public.hospital_professional_treatment_stats from public;
revoke all on table public.hospital_professional_treatment_stats from anon;
revoke all on table public.hospital_professional_treatment_stats from authenticated;
grant select, insert, update on table public.hospital_professional_treatment_stats to service_role;

create or replace function public.hospital_increment_professional_treatment_stat(
  p_hospital_id text,
  p_employee_tg_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count bigint;
begin
  if nullif(btrim(coalesce(p_hospital_id, '')), '') is null then
    raise exception using message = 'HOSPITAL_ID_REQUIRED';
  end if;

  if nullif(btrim(coalesce(p_employee_tg_id, '')), '') is null then
    raise exception using message = 'TELEGRAM_SESSION_REQUIRED';
  end if;

  insert into public.hospital_professional_treatment_stats (
    hospital_id,
    employee_tg_id,
    professional_treatments,
    updated_at
  )
  values (p_hospital_id, p_employee_tg_id, 1, now())
  on conflict (hospital_id, employee_tg_id) do update
  set professional_treatments = public.hospital_professional_treatment_stats.professional_treatments + 1,
      updated_at = now()
  returning professional_treatments into next_count;

  return jsonb_build_object(
    'hospitalId', p_hospital_id,
    'professionalTreatments', next_count
  );
end;
$$;

revoke all on function public.hospital_increment_professional_treatment_stat(text, text) from public;
revoke all on function public.hospital_increment_professional_treatment_stat(text, text) from anon;
revoke all on function public.hospital_increment_professional_treatment_stat(text, text) from authenticated;
revoke all on function public.hospital_increment_professional_treatment_stat(text, text) from service_role;

create or replace function public.hospital_get_professional_treatment_stats(
  p_actor_tg_id text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'stats',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'hospitalId', stats.hospital_id,
          'professionalTreatments', stats.professional_treatments
        )
        order by stats.hospital_id
      ),
      '[]'::jsonb
    )
  )
  from public.hospital_professional_treatment_stats as stats
  where stats.employee_tg_id = p_actor_tg_id;
$$;

revoke all on function public.hospital_get_professional_treatment_stats(text) from public;
revoke all on function public.hospital_get_professional_treatment_stats(text) from anon;
revoke all on function public.hospital_get_professional_treatment_stats(text) from authenticated;
grant execute on function public.hospital_get_professional_treatment_stats(text) to service_role;

create or replace function public.hospital_treat_player_for_price_counted(
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
  treatment jsonb;
  professional_stats jsonb;
begin
  treatment := to_jsonb(public.hospital_treat_player_for_price(
    p_hospital_id,
    p_actor_tg_id,
    p_target,
    p_medicine_type,
    p_price
  ));

  if treatment is null then
    raise exception using message = 'TREATMENT_APPLY_FAILED';
  end if;

  professional_stats := public.hospital_increment_professional_treatment_stat(
    p_hospital_id,
    p_actor_tg_id
  );

  return treatment || jsonb_build_object(
    'professionalStats', professional_stats
  );
end;
$$;

revoke all on function public.hospital_treat_player_for_price_counted(text, text, text, text, bigint) from public;
revoke all on function public.hospital_treat_player_for_price_counted(text, text, text, text, bigint) from anon;
revoke all on function public.hospital_treat_player_for_price_counted(text, text, text, text, bigint) from authenticated;
grant execute on function public.hospital_treat_player_for_price_counted(text, text, text, text, bigint) to service_role;

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
  apply_error text;
  professional_stats jsonb;
begin
  if p_item_type not in (
    'medicine_light',
    'medicine_strong',
    'medicine_resuscitation'
  ) then
    raise exception using message = 'INVALID_MEDICINE_REQUEST';
  end if;

  applied := to_jsonb(public.player_use_inventory_item(
    p_actor_tg_id,
    p_item_type,
    coalesce(nullif(btrim(p_source), ''), 'service'),
    p_hospital_id
  ));

  if applied is null then
    raise exception using message = 'TREATMENT_APPLY_FAILED';
  end if;

  apply_error := nullif(coalesce(applied ->> 'error', applied ->> 'reason'), '');
  if lower(coalesce(applied ->> 'ok', 'true')) in ('false', '0') then
    raise exception using message = coalesce(apply_error, 'TREATMENT_APPLY_FAILED');
  end if;

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

revoke all on function public.hospital_use_own_inventory_medicine(text, text, text, text) from public;
revoke all on function public.hospital_use_own_inventory_medicine(text, text, text, text) from anon;
revoke all on function public.hospital_use_own_inventory_medicine(text, text, text, text) from authenticated;
grant execute on function public.hospital_use_own_inventory_medicine(text, text, text, text) to service_role;

comment on table public.hospital_professional_treatment_stats
is 'Treatment counters for the separate professional doctor subsystem.';

comment on function public.hospital_use_own_inventory_medicine(text, text, text, text)
is 'Atomically applies a hospital medicine to the doctor and records the self-treatment in hospital statistics.';
