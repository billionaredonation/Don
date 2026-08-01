-- Doctor-to-player treatment must be one transaction.
--
-- hospital_issue_medicine already verifies the hospital employment/rank,
-- personal doctor stock, patient balance and performs the configured money
-- split. player_use_medicine already verifies patient HP/food/water and starts
-- the timed HP effect. Calling both inside this wrapper means any exception in
-- the second step rolls the first step back as well: no money or medicine can
-- be lost when treatment is rejected.

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
  issue_error text;
  apply_error text;
begin
  if nullif(btrim(coalesce(p_hospital_id, '')), '') is null then
    raise exception using message = 'HOSPITAL_ID_REQUIRED';
  end if;

  if nullif(btrim(coalesce(p_actor_tg_id, '')), '') is null then
    raise exception using message = 'TELEGRAM_SESSION_REQUIRED';
  end if;

  if nullif(btrim(coalesce(p_target, '')), '') is null then
    raise exception using message = 'PLAYER_NOT_FOUND';
  end if;

  if nullif(btrim(coalesce(p_medicine_type, '')), '') is null then
    raise exception using message = 'INVALID_MEDICINE_REQUEST';
  end if;

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

  if issued is null then
    raise exception using message = 'TREATMENT_ISSUE_FAILED';
  end if;

  issue_error := nullif(coalesce(issued ->> 'error', issued ->> 'reason'), '');
  if lower(coalesce(issued ->> 'ok', 'true')) in ('false', '0') then
    raise exception using message = coalesce(issue_error, 'TREATMENT_ISSUE_FAILED');
  end if;

  patient_tg_id := nullif(coalesce(
    issued ->> 'patientTgId',
    issued ->> 'patient_tg_id',
    issued ->> 'patientTelegramId',
    issued ->> 'patient_telegram_id'
  ), '');

  if patient_tg_id is null then
    raise exception using message = 'PLAYER_NOT_FOUND';
  end if;

  if patient_tg_id = p_actor_tg_id then
    raise exception using message = 'SELF_TREATMENT_USE_INVENTORY';
  end if;

  begin
    applied := to_jsonb(public.player_use_medicine(
      patient_tg_id,
      p_medicine_type
    ));
  exception
    when others then
      if position('PLAYER_FOOD_TOO_LOW' in sqlerrm) > 0 then
        raise exception using message = 'PATIENT_FOOD_TOO_LOW';
      elsif position('PLAYER_WATER_TOO_LOW' in sqlerrm) > 0 then
        raise exception using message = 'PATIENT_WATER_TOO_LOW';
      elsif position('PLAYER_ALREADY_TREATED' in sqlerrm) > 0 then
        raise exception using message = 'PATIENT_ALREADY_TREATED';
      else
        raise;
      end if;
  end;

  if applied is null then
    raise exception using message = 'TREATMENT_APPLY_FAILED';
  end if;

  apply_error := nullif(coalesce(applied ->> 'error', applied ->> 'reason'), '');
  if lower(coalesce(applied ->> 'ok', 'true')) in ('false', '0') then
    raise exception using message = coalesce(apply_error, 'TREATMENT_APPLY_FAILED');
  end if;

  return jsonb_strip_nulls(
    issued || jsonb_build_object(
      'medicineApplied', true,
      'treatment', applied,
      'health', coalesce(
        applied -> 'health',
        applied -> 'vitals' -> 'health',
        applied -> 'player' -> 'health'
      ),
      'food', coalesce(
        applied -> 'food',
        applied -> 'vitals' -> 'food',
        applied -> 'player' -> 'food'
      ),
      'water', coalesce(
        applied -> 'water',
        applied -> 'vitals' -> 'water',
        applied -> 'player' -> 'water'
      ),
      'active', coalesce(applied -> 'active', 'true'::jsonb),
      'nextPollMs', coalesce(
        applied -> 'nextPollMs',
        applied -> 'next_poll_ms'
      )
    )
  );
end;
$$;

revoke all on function public.hospital_treat_player_for_price(text, text, text, text, bigint) from public;
revoke all on function public.hospital_treat_player_for_price(text, text, text, text, bigint) from anon;
revoke all on function public.hospital_treat_player_for_price(text, text, text, text, bigint) from authenticated;
grant execute on function public.hospital_treat_player_for_price(text, text, text, text, bigint) to service_role;

comment on function public.hospital_treat_player_for_price(text, text, text, text, bigint)
is 'Atomically charges a patient, consumes one doctor medicine and immediately starts the patient HP treatment effect.';
