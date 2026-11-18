-- =============================================================================
-- ito · Calendario v2 (docs/plan-calendario-v2.md §3)
--   1. events.category: viaje, comer fuera, ocio, cumpleaños u otros (por defecto 'other').
--   2. events.birth_year: año de nacimiento opcional de un cumpleaños («cumple 60»).
--   3. events_varios_dias: un evento de varios días es de todo el día, dura como mucho 31 días y, si se
--      repite, no se pisa con su siguiente repetición (semanal ≤ 7 días, mensual ≤ 28).
--   4. events_cumple: un cumpleaños es anual, de todo el día, sin secreto ni presupuesto ni «¿Quién pagó?»,
--      y guarda día y mes en el año ancla 2000 (bisiesto: así existe el 29 de febrero).
--   5. calendar_range: mismas columnas que en 20261120000000 y dos más al final (category, birth_year).
-- Requiere 20261120000000_calendario.sql aplicada antes (ahora o justo antes).
-- NO aplicada: la ejecuta David en el SQL Editor. Idempotente: se puede volver a ejecutar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Requisito: 20261120000000_calendario.sql (crea el trigger y_cancel_date_requests en events)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_trigger t
    where t.tgname = 'y_cancel_date_requests' and t.tgrelid = 'public.events'::regclass and not t.tgisinternal
  ) then
    raise exception 'Aplica antes 20261120000000_calendario.sql';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1 y 2. Columnas nuevas
--    Texto + CHECK y no enum: añadir una categoría más es cambiar un CHECK, sin «alter type … add value».
--    El default rellena los eventos que ya existen con 'other'.
-- -----------------------------------------------------------------------------
alter table public.events add column if not exists category text not null default 'other';
alter table public.events add column if not exists birth_year smallint;

alter table public.events drop constraint if exists events_category;
alter table public.events add constraint events_category
  check (category in ('trip', 'eating_out', 'leisure', 'birthday', 'other'));

-- El «no en el futuro» lo valida la app.
alter table public.events drop constraint if exists events_birth_year;
alter table public.events add constraint events_birth_year
  check (birth_year is null or (category = 'birthday' and birth_year between 1900 and 2100));

-- -----------------------------------------------------------------------------
-- 3. Varios días (los eventos de un plan quedan fuera, para no atar al Planificador)
--    Un día = end_date null (la app nunca manda end_date = start_date).
--    Mensual ≤ 27 de diferencia (28 días): el 31 ene → 28 feb no se pisa con el siguiente.
-- -----------------------------------------------------------------------------
alter table public.events drop constraint if exists events_varios_dias;
alter table public.events add constraint events_varios_dias
  check (
    plan_id is not null
    or end_date is null
    or (all_day
        and end_date > start_date
        and end_date - start_date <= 30
        and (recurrence <> 'weekly' or end_date - start_date <= 6)
        and (recurrence <> 'monthly' or end_date - start_date <= 27))
  );

-- -----------------------------------------------------------------------------
-- 4. Cumpleaños
--    Año ancla 2000 (bisiesto): start_date = 2000-MM-DD guarda día y mes; occurrence_dates lo pone el 28 de
--    febrero los años no bisiestos (lo mismo que ya hacen los anuales). El año real va en birth_year.
--    attendees significa aquí «de parte de quién» (m1, m2 o los dos).
-- -----------------------------------------------------------------------------
alter table public.events drop constraint if exists events_cumple;
alter table public.events add constraint events_cumple
  check (
    category <> 'birthday'
    or (recurrence = 'yearly'
        and recurrence_until is null
        and all_day
        and start_time is null
        and end_date is null
        and budget_cents is null
        and not ask_who_paid
        and not is_secret
        and plan_id is null
        and extract(year from start_date) = 2000)
  );

-- -----------------------------------------------------------------------------
-- 5. calendar_range
--    Cambia el tipo de salida (dos columnas nuevas al final), así que hay que borrarla y crearla.
--    Mismo cuerpo, revoke/grant y límite de 100 días que en 20261120000000.
--    security invoker: la RLS oculta los eventos secretos y los recurrentes privados de la pareja.
-- -----------------------------------------------------------------------------
drop function if exists public.calendar_range(date, date);

create function public.calendar_range(p_from date, p_to date)
returns table (
  kind          text,      -- 'event' | 'payment' | 'plan'
  source_id     uuid,
  occurs_on     date,
  ends_on       date,
  title         text,
  icon          text,
  start_time    time,
  all_day       boolean,
  place_id      uuid,
  plan_id       uuid,
  amount_cents  integer,
  is_estimate   boolean,   -- importe aproximado (pago variable aún sin importe real)
  status        text,      -- pagos: scheduled | pending | paid
  recurrence    text,      -- eventos: none | weekly | monthly | yearly (null en pagos y planes)
  attendees     text,      -- eventos: both | m1 | m2 (null en pagos y planes)
  is_secret     boolean,   -- eventos secretos (false en pagos y planes)
  occurrence_id uuid,      -- pagos: el cobro de recurring_occurrences, si ya existe (null si es previsto)
  category      text,      -- eventos: trip | eating_out | leisure | birthday | other (null en pagos y planes)
  birth_year    smallint   -- cumpleaños: año de nacimiento, si se puso (null en el resto)
)
language plpgsql stable security invoker set search_path = '' as $$
#variable_conflict use_column
declare
  v_couple uuid := private.my_couple_id();
  v_today  date;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Rango de fechas no válido: el inicio tiene que ser anterior o igual al final' using errcode = 'TW052';
  end if;
  if p_to - p_from > 100 then
    raise exception 'Rango de fechas demasiado largo: como mucho 100 días' using errcode = 'TW052';
  end if;
  if v_couple is null then
    return;
  end if;
  v_today := private.couple_today(v_couple);

  return query
  -- Eventos (repeticiones expandidas, sin las fechas anuladas; los de un plan los representa su banda).
  -- Un evento de varios días que empezó antes del rango también sale: se expande desde p_from - duración.
  select 'event'::text, e.id, d.d, d.d + (coalesce(e.end_date, e.start_date) - e.start_date),
         e.title, null::text, e.start_time, e.all_day, e.place_id, e.plan_id,
         e.budget_cents, false, null::text,
         e.recurrence::text, e.attendees::text, e.is_secret, null::uuid,
         e.category, e.birth_year
  from public.events e
  cross join lateral private.occurrence_dates(
      e.start_date, e.recurrence, e.recurrence_until,
      p_from - (coalesce(e.end_date, e.start_date) - e.start_date), p_to) as d(d)
  where e.couple_id = v_couple
    and e.plan_id is null
    and not exists (select 1 from public.event_exceptions x where x.event_id = e.id and x.occurrence_date = d.d)
  union all
  -- Pagos ya cobrados (pasados y los de hoy que el job ya creó): lo que hay en recurring_occurrences,
  -- aunque el recurrente esté en pausa o haya cambiado de día. Los saltados no salen.
  select 'payment'::text, r.id, o.due_date, o.due_date, r.name, null::text, null::time, true, null::uuid, null::uuid,
         coalesce(o.amount_cents, r.amount_cents), r.is_variable and o.amount_cents is null,
         o.status::text,
         null::text, null::text, false, o.id,
         null::text, null::smallint
  from public.recurring_occurrences o
  join public.recurring_payments r on r.id = o.recurring_id
  where o.couple_id = v_couple
    and o.due_date between p_from and p_to
    and o.status <> 'skipped'
    and r.show_in_calendar
  union all
  -- Pagos previstos (de hoy en adelante): solo si no está en pausa, nunca antes de active_from, y sin
  -- repetir un periodo (mes, año o, si es puntual, en total) que ya tiene cobro desde active_from
  -- (los saltados cuentan), igual que private.run_daily_jobs. Una fecha con cobro sale en el bloque anterior.
  select 'payment'::text, r.id, d.d, d.d, r.name, null::text, null::time, true, null::uuid, null::uuid,
         r.amount_cents, r.is_variable,
         'scheduled'::text,
         null::text, null::text, false, null::uuid,
         null::text, null::smallint
  from public.recurring_payments r
  cross join lateral private.payment_due_dates(
      r.frequency, r.day_of_month, r.month_of_year, r.start_date, r.end_date,
      greatest(p_from, v_today, r.active_from), p_to) as d(d)
  where r.couple_id = v_couple
    and r.show_in_calendar and not r.paused
    and greatest(p_from, v_today, r.active_from) <= p_to
    and not exists (
      select 1 from public.recurring_occurrences o
      where o.recurring_id = r.id
        and (o.due_date = d.d
             or (o.due_date >= r.active_from
                 and (r.frequency = 'once'
                      or (r.frequency = 'monthly' and date_trunc('month', o.due_date::timestamp) = date_trunc('month', d.d::timestamp))
                      or (r.frequency = 'yearly' and extract(year from o.due_date) = extract(year from d.d))))))
  union all
  -- Planes (bandas).
  select 'plan'::text, p.id, p.start_date, p.end_date, p.name, p.icon, null::time, true, null::uuid, p.id,
         p.budget_cents, false, null::text,
         null::text, null::text, false, null::uuid,
         null::text, null::smallint
  from public.plans p
  where p.couple_id = v_couple
    and p.start_date <= p_to and p.end_date >= p_from
  order by 3, 7 nulls first, 5;
end $$;

revoke all on function public.calendar_range(date, date) from public, anon;
grant execute on function public.calendar_range(date, date) to authenticated;

-- PostgREST: que vea la columna nueva de events y la nueva firma de calendar_range sin esperar.
notify pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- Sin cambios (comprobado, docs/plan-calendario-v2.md §3.7): events_before_write (ya calcula ends_at de varios
-- días), request_deletion / execute_deletion (trabajan con la fecha de inicio de cada repetición),
-- pending_actions (un cumpleaños no tiene «¿Quién pagó?» por CHECK), RLS, tiempo real y leave_couple.
-- Fuera: impedir en el servidor «solo este año» de un cumpleaños; si alguien lo forzara, solo ocultaría ese año,
-- con la aprobación de la pareja.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- COMPROBACIONES (a mano, en el SQL Editor; todas con rollback)
--
-- ANTES de aplicar la migración (esperado 0; si no, el CHECK events_varios_dias fallará al crearse):
--   select count(*) from public.events where end_date is not null and plan_id is null;
--
-- DESPUÉS: un evento que ya existía sale con category = 'other':
--   select title, category, birth_year from public.events order by created_at limit 5;
--
-- Las pruebas de abajo usan la parte de tu pareja (set local role authenticated + tu uid). Cambia '<tu uid>'
-- y pon un couple_id válido donde se indica. Todas acaban en rollback: no se guarda nada.
--
-- 1) Un cumpleaños secreto → viola events_cumple:
--      begin;
--      set local role authenticated;
--      select set_config('request.jwt.claims', '{"sub":"<tu uid>","role":"authenticated"}', true);
--      insert into public.events (couple_id, title, start_date, all_day, recurrence, category, is_secret)
--      values ((select private.my_couple_id()), 'Prueba', '2000-03-15', true, 'yearly', 'birthday', true);
--      rollback;
--
-- 2) Un evento de 40 días → viola events_varios_dias:
--      begin;
--      set local role authenticated;
--      select set_config('request.jwt.claims', '{"sub":"<tu uid>","role":"authenticated"}', true);
--      insert into public.events (couple_id, title, start_date, end_date, all_day)
--      values ((select private.my_couple_id()), 'Largo', current_date, current_date + 40, true);
--      rollback;
--
-- 3) Un semanal de 8 días (diferencia 7) → viola events_varios_dias (y de 7 días, diferencia 6, sí se permite):
--      begin;
--      set local role authenticated;
--      select set_config('request.jwt.claims', '{"sub":"<tu uid>","role":"authenticated"}', true);
--      insert into public.events (couple_id, title, start_date, end_date, all_day, recurrence)
--      values ((select private.my_couple_id()), 'Semanal largo', current_date, current_date + 7, true, 'weekly');
--      rollback;
--
-- 4) Un cumpleaños 2000-02-29 → calendar_range lo devuelve el 28 feb de 2027 (y el 29 de 2028):
--      begin;
--      set local role authenticated;
--      select set_config('request.jwt.claims', '{"sub":"<tu uid>","role":"authenticated"}', true);
--      insert into public.events (couple_id, title, start_date, all_day, recurrence, category, birth_year)
--      values ((select private.my_couple_id()), 'Cumple bisiesto', '2000-02-29', true, 'yearly', 'birthday', 1996);
--      select occurs_on, ends_on, category, birth_year from public.calendar_range('2027-02-01', '2027-03-05') where title = 'Cumple bisiesto';
--      select occurs_on from public.calendar_range('2028-02-01', '2028-03-05') where title = 'Cumple bisiesto';
--      rollback;
--
-- 5) Un viaje del 28 oct al 3 nov → calendar_range desde el 1 nov lo devuelve con occurs_on = 28 oct y ends_on = 3 nov:
--      begin;
--      set local role authenticated;
--      select set_config('request.jwt.claims', '{"sub":"<tu uid>","role":"authenticated"}', true);
--      insert into public.events (couple_id, title, start_date, end_date, all_day, category)
--      values ((select private.my_couple_id()), 'Viaje de prueba', '2026-10-28', '2026-11-03', true, 'trip');
--      select occurs_on, ends_on, category from public.calendar_range('2026-11-01', '2026-11-30') where title = 'Viaje de prueba';
--      rollback;
-- -----------------------------------------------------------------------------
