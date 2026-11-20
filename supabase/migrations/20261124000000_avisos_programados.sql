-- =============================================================================
-- ito · Avisos push, fase 3: avisos programados (docs/plan-avisos-push.md §3.2, §3.4 y §4.1)
--
-- Qué hace:
--   1. events.reminder_minutes: como mucho 10080 (7 días), así la ventana de cálculo está acotada.
--   2. private.format_money y private.aviso_cuando: textos de los avisos («12,99 €», «Mañana a las 20:30»).
--   3. private.planned_payment_dates: la regla de «pagos previstos» que estaba dentro de calendar_range.
--      calendar_range pasa a usarla (misma firma, mismas columnas y mismo resultado: una sola regla).
--   4. private.enqueue_scheduled(p_now): decide qué avisar, a quién y cuándo (la llama private.avisos_tick
--      cada minuto, ver la migración 20261123000000):
--        eventos, cumpleaños, cobro próximo, importe variable pendiente y «¿Quién pagó?».
--
-- Reglas comunes: el instante del aviso cae en (p_now - 30 min, p_now] y es posterior a la última edición
-- del elemento; la clave anti-duplicado lleva el instante y el destinatario (la clave es única en toda la
-- cola, y un mismo aviso va a dos personas); solo miembros activos con su preferencia notify_* activada.
-- Privacidad: evento secreto solo a quien lo creó; recurrente privado (no visible para la pareja) solo a su dueño.
--
-- Requiere 20261123000000_avisos_base.sql (private.enqueue_push) y 20261121000000_calendario_v2.sql.
-- Es idempotente: se puede ejecutar más de una vez. La parte A (cambios) va en una transacción propia
-- y la parte B (pruebas) acaba en ROLLBACK sin deshacer la parte A.
-- NO aplicada: la ejecuta David en el SQL Editor.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Requisitos
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('private.enqueue_push(uuid, uuid, text, text, text, text, text, text)') is null then
    raise exception 'Aplica antes 20261123000000_avisos_base.sql';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'events' and column_name = 'category') then
    raise exception 'Aplica antes 20261121000000_calendario_v2.sql';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. reminder_minutes acotado (la app usa como mucho 9540)
-- -----------------------------------------------------------------------------
alter table public.events drop constraint if exists events_reminder_minutes_max;
alter table public.events add constraint events_reminder_minutes_max
  check (reminder_minutes is null or reminder_minutes between 0 and 10080);

-- -----------------------------------------------------------------------------
-- 2. Textos
-- -----------------------------------------------------------------------------
-- 1299 → «12,99 €»; 4000 → «40 €»; 123456 → «1.234,56 €».
create or replace function private.format_money(p_cents integer, p_currency text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace((p_cents / 100)::text, '(\d)(?=(\d{3})+$)', '\1.', 'g')
         || case when p_cents % 100 = 0 then '' else ',' || lpad((p_cents % 100)::text, 2, '0') end
         || ' '
         || case upper(trim(p_currency)) when 'EUR' then '€' when 'USD' then '$' when 'GBP' then '£'
                                          else upper(trim(p_currency)) end
$$;

-- «Hoy», «Mañana», «En una semana», «En 3 días», con «a las 20:30» si se da la hora.
create or replace function private.aviso_cuando(p_days integer, p_time time) returns text
language sql immutable set search_path = '' as $$
  select case when p_days <= 0 then 'Hoy' when p_days = 1 then 'Mañana' when p_days = 7 then 'En una semana'
              else 'En ' || p_days || ' días' end
         || coalesce(' a las ' || to_char(p_time, 'HH24:MI'), '')
$$;

-- -----------------------------------------------------------------------------
-- 3. Pagos previstos: una sola regla para calendar_range y para el aviso de cobro
--    Fechas de cobro futuras de un recurrente en [p_from, p_to], desde «hoy» (p_today = hoy de la pareja):
--    solo si no está en pausa, nunca antes de active_from, y sin repetir un periodo (mes, año o, si es
--    puntual, en total) que ya tiene cobro desde active_from (los saltados cuentan), igual que
--    private.run_daily_jobs. Una fecha que ya tiene cobro NO sale aquí. security invoker: calendar_range la
--    llama con la RLS del usuario.
-- -----------------------------------------------------------------------------
create or replace function private.planned_payment_dates(p_r public.recurring_payments, p_today date, p_from date, p_to date)
returns setof date
language sql stable security invoker set search_path = '' as $$
  select d.d
  from private.payment_due_dates(p_r.frequency, p_r.day_of_month, p_r.month_of_year, p_r.start_date, p_r.end_date,
                                 greatest(p_from, p_today, p_r.active_from), p_to) as d(d)
  where not p_r.paused
    and greatest(p_from, p_today, p_r.active_from) <= p_to
    and not exists (
      select 1 from public.recurring_occurrences o
      where o.recurring_id = p_r.id
        and (o.due_date = d.d
             or (o.due_date >= p_r.active_from
                 and (p_r.frequency = 'once'
                      or (p_r.frequency = 'monthly' and date_trunc('month', o.due_date::timestamp) = date_trunc('month', d.d::timestamp))
                      or (p_r.frequency = 'yearly' and extract(year from o.due_date) = extract(year from d.d))))))
$$;

-- calendar_range: idéntica a la de 20261121000000 salvo el bloque de «Pagos previstos», que usa la función.
-- Mismas columnas y tipos, así que create or replace conserva sus permisos (se repiten abajo igualmente).
create or replace function public.calendar_range(p_from date, p_to date)
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
  -- Pagos previstos (de hoy en adelante): la regla está en private.planned_payment_dates (pausa, active_from,
  -- un cobro por periodo), la misma que usa el aviso de cobro.
  select 'payment'::text, r.id, d.d, d.d, r.name, null::text, null::time, true, null::uuid, null::uuid,
         r.amount_cents, r.is_variable,
         'scheduled'::text,
         null::text, null::text, false, null::uuid,
         null::text, null::smallint
  from public.recurring_payments r
  cross join lateral private.planned_payment_dates(r, v_today, p_from, p_to) as d(d)
  where r.couple_id = v_couple
    and r.show_in_calendar
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

-- -----------------------------------------------------------------------------
-- 4. Avisos programados
--    Devuelve cuántos avisos nuevos ha encolado. Cada bloque va aislado: si uno falla, avisa con un
--    WARNING y los demás siguen.
-- -----------------------------------------------------------------------------
create or replace function private.enqueue_scheduled(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_total integer := 0;
  v_n     integer;
begin
  -- 1 y 2. Eventos y cumpleaños.
  --   Fechas: occurrence_dates (sin las anuladas) en la zona del evento, de ayer a dentro de 8 días.
  --   Instante: todo el día (o sin hora) → hora de pared (las 9:00 siguen siendo las 9:00 con el cambio de hora);
  --   con hora → starts_at menos los minutos. Secreto → solo quien lo creó; cumpleaños → los dos; si no, attendees.
  begin
    select coalesce(sum(private.enqueue_push(
             m.user_id, x.couple_id,
             case when x.category = 'birthday' then 'birthday' else 'event' end,
             'event:' || x.id || ':' || x.occ || ':' || extract(epoch from x.instant)::bigint || ':' || m.user_id,
             case when x.category = 'birthday'
                  then private.aviso_cuando(x.occ - x.today, null::time) || ' es el cumpleaños de ' || x.title
                  else x.title end,
             case when x.category = 'birthday'
                  then coalesce('Cumple ' || (extract(year from x.occ)::integer - x.birth_year), 'Cumpleaños')
                  else private.aviso_cuando(x.occ - x.today, case when x.all_day then null else x.start_time end) end,
             '/calendario/evento/' || x.id || '?fecha=' || x.occ,
             'notify_events')::integer), 0)
      into v_n
    from (
      select e.id, e.couple_id, e.title, e.category, e.birth_year, e.attendees, e.is_secret, e.created_by,
             e.all_day, e.start_time, o.d as occ, lt.t as today, i.instant
      from public.events e
      cross join lateral (select (p_now at time zone e.time_zone)::date as t) lt
      cross join lateral private.occurrence_dates(e.start_date, e.recurrence, e.recurrence_until, lt.t - 1, lt.t + 8) as o(d)
      cross join lateral (
        select case when e.all_day or e.start_time is null
                    then ((o.d + time '00:00') - make_interval(mins => e.reminder_minutes)) at time zone e.time_zone
                    else ((o.d + e.start_time) at time zone e.time_zone) - make_interval(mins => e.reminder_minutes)
               end as instant) i
      where e.reminder_minutes is not null
        and i.instant > p_now - interval '30 minutes' and i.instant <= p_now
        and i.instant > e.updated_at
        and not exists (select 1 from public.event_exceptions ex where ex.event_id = e.id and ex.occurrence_date = o.d)
    ) x
    join public.couple_members m on m.couple_id = x.couple_id and m.left_at is null
     and case when x.is_secret then m.user_id = x.created_by
              when x.category = 'birthday' then true
              else x.attendees = 'both' or x.attendees::text = m.slot::text end;
    v_total := v_total + v_n;
  exception when others then
    raise warning 'enqueue_scheduled: eventos: %', sqlerrm;
  end;

  -- 3. Cobro próximo (reminder_days, no en pausa): a las 9:00 locales de «cobro - reminder_days».
  --   Fechas = pagos previstos MÁS los cobros ya creados (el job de las 04:15 UTC crea el de hoy y los previstos
  --   lo excluyen: sin esto, «el mismo día» nunca avisaría). Privado → solo su dueño; compartido → los dos.
  begin
    select coalesce(sum(private.enqueue_push(
             m.user_id, x.couple_id, 'payment_due',
             'payment_due:' || x.id || ':' || x.due || ':' || m.user_id,
             private.aviso_cuando(x.due - x.today, null::time) || ' se cobra ' || x.name,
             case when x.is_variable then '≈ ' else '' end || private.format_money(x.amount_cents, x.currency::text),
             '/gastos/recurrente/' || x.id,
             'notify_payment_reminder')::integer), 0)
      into v_n
    from (
      select r.id, r.couple_id, r.name, r.amount_cents, r.is_variable, r.visible_to_partner, r.created_by,
             c.currency, lt.t as today, du.d as due
      from public.recurring_payments r
      join public.couples c on c.id = r.couple_id
      cross join lateral (select (p_now at time zone c.time_zone)::date as t) lt
      cross join lateral (
        select pp.d from private.planned_payment_dates(r, lt.t, lt.t, lt.t + 3) as pp(d)
        union
        select o.due_date from public.recurring_occurrences o
        where o.recurring_id = r.id and o.status <> 'skipped' and o.due_date between lt.t and lt.t + 3
      ) du(d)
      cross join lateral (
        select (((du.d - r.reminder_days) + time '09:00') at time zone c.time_zone) as instant) i
      where r.reminder_days is not null and not r.paused
        and i.instant > p_now - interval '30 minutes' and i.instant <= p_now
        and i.instant > r.updated_at
    ) x
    join public.couple_members m on m.couple_id = x.couple_id and m.left_at is null
     and (x.visible_to_partner or m.user_id = x.created_by);
    v_total := v_total + v_n;
  exception when others then
    raise warning 'enqueue_scheduled: cobros: %', sqlerrm;
  end;

  -- 4. Importe variable pendiente: una vez, a las 9:00 locales del día siguiente al cobro, si sigue pendiente.
  begin
    select coalesce(sum(private.enqueue_push(
             m.user_id, x.couple_id, 'variable_amount',
             'variable:' || x.id || ':' || m.user_id,
             'Falta el importe de ' || x.name,
             'Ponlo para que cuente en los gastos.',
             '/',
             'notify_payment_reminder')::integer), 0)
      into v_n
    from (
      select o.id, o.couple_id, r.name, r.visible_to_partner, r.created_by
      from public.recurring_occurrences o
      join public.recurring_payments r on r.id = o.recurring_id
      join public.couples c on c.id = o.couple_id
      cross join lateral (
        select (((o.due_date + 1) + time '09:00') at time zone c.time_zone) as instant) i
      where o.status = 'pending' and not r.paused
        and i.instant > p_now - interval '30 minutes' and i.instant <= p_now
        and i.instant > o.created_at
    ) x
    join public.couple_members m on m.couple_id = x.couple_id and m.left_at is null
     and (x.visible_to_partner or m.user_id = x.created_by);
    v_total := v_total + v_n;
  exception when others then
    raise warning 'enqueue_scheduled: importe variable: %', sqlerrm;
  end;

  -- 5. «¿Quién pagó?» (ask_who_paid sin resolver, como pending_actions): a los 15 min de terminar el evento;
  --   si cae entre las 22:00 y las 9:00 locales, a las 9:00. Attendees; secreto → solo quien lo creó.
  begin
    select coalesce(sum(private.enqueue_push(
             m.user_id, x.couple_id, 'who_paid',
             'who_paid:' || x.id || ':' || m.user_id,
             '¿Quién pagó?',
             x.title,
             '/',
             'notify_who_paid')::integer), 0)
      into v_n
    from (
      select e.id, e.couple_id, e.title, e.attendees, e.is_secret, e.created_by
      from public.events e
      cross join lateral (select (e.ends_at + interval '15 minutes') at time zone e.time_zone as lt) l
      cross join lateral (
        select (case when l.lt::time >= time '22:00' then ((l.lt::date + 1) + time '09:00')
                     when l.lt::time < time '09:00' then (l.lt::date + time '09:00')
                     else l.lt end) at time zone e.time_zone as instant) i
      where e.ask_who_paid and e.who_paid_resolved_at is null
        and e.ends_at <= p_now and e.ends_at > p_now - interval '2 days'
        and i.instant > p_now - interval '30 minutes' and i.instant <= p_now
        and i.instant > e.updated_at
    ) x
    join public.couple_members m on m.couple_id = x.couple_id and m.left_at is null
     and case when x.is_secret then m.user_id = x.created_by
              else x.attendees = 'both' or x.attendees::text = m.slot::text end;
    v_total := v_total + v_n;
  exception when others then
    raise warning 'enqueue_scheduled: quién pagó: %', sqlerrm;
  end;

  return v_total;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Permisos explícitos
-- -----------------------------------------------------------------------------
revoke all on function private.format_money(integer, text)                  from public, anon, authenticated;
revoke all on function private.aviso_cuando(integer, time)                  from public, anon, authenticated;
revoke all on function private.enqueue_scheduled(timestamptz)               from public, anon, authenticated;
revoke all on function private.planned_payment_dates(public.recurring_payments, date, date, date) from public, anon;
-- calendar_range es security invoker y la llama el usuario: necesita ejecutar la función compartida.
grant execute on function private.planned_payment_dates(public.recurring_payments, date, date, date) to authenticated;
revoke all on function public.calendar_range(date, date) from public, anon;
grant execute on function public.calendar_range(date, date) to authenticated;
-- format_money, aviso_cuando y enqueue_scheduled no se conceden a nadie: las usa private.avisos_tick (cron).

notify pgrst, 'reload schema';

commit;

-- =============================================================================
-- PARTE B · Pruebas con hora fija (no dejan nada: todo acaba en ROLLBACK). Ejecutar como postgres.
-- Las horas de las pruebas están en 2030 (y 2020 para «creado después»): así el updated_at real de lo que
-- crean las pruebas queda antes (o después) del instante del aviso. Pareja de prueba en Europe/Madrid.
-- Si una prueba falla, el script se detiene con «FALLO: ...» y la parte A ya está aplicada.
-- =============================================================================
begin;
set local idle_in_transaction_session_timeout = '60s';

-- Los avisos reales que hubiera en la cola quedan fuera de las pruebas (se deshace en el ROLLBACK).
update public.push_outbox set send_after = 'infinity' where status in ('queued', 'sending');

create function pg_temp.n_avisos(p_key text, p_user uuid default null) returns integer
language sql as $$
  select count(*)::integer from public.push_outbox where dedupe_key like p_key and (p_user is null or user_id = p_user)
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'avisos-a@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'avisos-b@prueba.invalid', 'authenticated', 'authenticated');
insert into public.couples (id) values ('00000000-0000-4000-8000-0000000000c1');
insert into public.couple_members (couple_id, user_id, slot) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'm1'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a2', 'm2');

-- B1. Permisos, textos y límite de reminder_minutes
do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000c1';
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_ok boolean;
begin
  assert not has_function_privilege('authenticated', 'private.enqueue_scheduled(timestamptz)', 'execute'), 'FALLO: authenticated ejecuta enqueue_scheduled';
  assert not has_function_privilege('anon', 'private.enqueue_scheduled(timestamptz)', 'execute'), 'FALLO: anon ejecuta enqueue_scheduled';
  assert has_function_privilege('authenticated', 'private.planned_payment_dates(public.recurring_payments, date, date, date)', 'execute'), 'FALLO: authenticated debe ejecutar planned_payment_dates';
  assert not has_function_privilege('anon', 'private.planned_payment_dates(public.recurring_payments, date, date, date)', 'execute'), 'FALLO: anon ejecuta planned_payment_dates';
  assert has_function_privilege('authenticated', 'public.calendar_range(date, date)', 'execute'), 'FALLO: authenticated debe ejecutar calendar_range';
  assert not has_function_privilege('anon', 'public.calendar_range(date, date)', 'execute'), 'FALLO: anon ejecuta calendar_range';
  assert (select prosecdef from pg_proc where oid = 'private.enqueue_scheduled(timestamptz)'::regprocedure), 'FALLO: enqueue_scheduled debe ser security definer';
  assert not (select prosecdef from pg_proc where oid = 'private.planned_payment_dates(public.recurring_payments, date, date, date)'::regprocedure), 'FALLO: planned_payment_dates debe ser security invoker';
  assert not (select prosecdef from pg_proc where oid = 'public.calendar_range(date, date)'::regprocedure), 'FALLO: calendar_range debe seguir siendo security invoker';

  assert private.format_money(1299, 'EUR') = '12,99 €', 'FALLO: format_money 1299 → ' || private.format_money(1299, 'EUR');
  assert private.format_money(4000, 'EUR') = '40 €', 'FALLO: format_money 4000';
  assert private.format_money(123456, 'EUR') = '1.234,56 €', 'FALLO: format_money 123456 → ' || private.format_money(123456, 'EUR');
  assert private.format_money(5, 'USD') = '0,05 $', 'FALLO: format_money 5 USD';
  assert private.format_money(100000000, 'EUR') = '1.000.000 €', 'FALLO: format_money 1.000.000';
  assert private.aviso_cuando(0, time '20:30') = 'Hoy a las 20:30', 'FALLO: aviso_cuando 0';
  assert private.aviso_cuando(1, null) = 'Mañana', 'FALLO: aviso_cuando 1';
  assert private.aviso_cuando(7, null) = 'En una semana', 'FALLO: aviso_cuando 7';
  assert private.aviso_cuando(3, null) = 'En 3 días', 'FALLO: aviso_cuando 3';

  -- reminder_minutes: 10080 vale, 10081 no
  insert into public.events (couple_id, title, start_date, reminder_minutes, created_by) values (v_c, 'Límite', '2030-01-10', 10080, v_a);
  v_ok := false;
  begin
    insert into public.events (couple_id, title, start_date, reminder_minutes, created_by) values (v_c, 'Pasado', '2030-01-10', 10081, v_a);
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: reminder_minutes 10081 aceptado';
end $$;

-- B2. Eventos con hora, ventana de 30 min, hora anterior a la última edición, destinatarios y preferencias
do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000c1';
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_b constant uuid := '00000000-0000-4000-8000-0000000000a2';
  v_e1 uuid; v_e2 uuid; v_e3 uuid; v_e7 uuid; v_e8 uuid; v_e9 uuid;
  v_tot integer;
begin
  -- E1: cena a las 20:30 con aviso 1 h antes → 19:30 locales (CEST) = 17:30 UTC.
  insert into public.events (couple_id, title, start_date, start_time, reminder_minutes, created_by)
  values (v_c, 'Cena en Taberna', '2030-05-10', '20:30', 60, v_a) returning id into v_e1;
  perform private.enqueue_scheduled('2030-05-10 17:29:00+00');
  assert pg_temp.n_avisos('event:' || v_e1 || ':%') = 0, 'FALLO: avisa antes de tiempo';
  perform private.enqueue_scheduled('2030-05-10 17:35:00+00');
  assert pg_temp.n_avisos('event:' || v_e1 || ':%', v_a) = 1 and pg_temp.n_avisos('event:' || v_e1 || ':%', v_b) = 1,
         'FALLO: un evento de los dos debe avisar a los dos';
  assert (select title || ' | ' || body || ' | ' || kind || ' | ' || url from public.push_outbox where dedupe_key like 'event:' || v_e1 || ':%' and user_id = v_a)
         = 'Cena en Taberna | Hoy a las 20:30 | event | /calendario/evento/' || v_e1 || '?fecha=2030-05-10', 'FALLO: texto del aviso de evento';
  -- sin duplicados: otra ejecución con la misma hora y otra dentro de la ventana
  select count(*) into v_tot from public.push_outbox where couple_id = v_c;
  perform private.enqueue_scheduled('2030-05-10 17:35:00+00');
  perform private.enqueue_scheduled('2030-05-10 17:50:00+00');
  assert (select count(*) from public.push_outbox where couple_id = v_c) = v_tot, 'FALLO: avisos duplicados al ejecutar dos veces';
  assert private.enqueue_scheduled('2030-05-10 17:35:00+00') >= 0, 'FALLO: enqueue_scheduled debe devolver un número';

  -- E2: si el cron estuvo caído más de 30 min, el aviso se pierde (mejor que avisar tarde)
  insert into public.events (couple_id, title, start_date, start_time, reminder_minutes, created_by)
  values (v_c, 'Cine', '2030-05-10', '21:00', 60, v_a) returning id into v_e2;   -- aviso a las 18:00 UTC
  perform private.enqueue_scheduled('2030-05-10 18:31:00+00');
  assert pg_temp.n_avisos('event:' || v_e2 || ':%') = 0, 'FALLO: avisa tarde (más de 30 min)';
  perform private.enqueue_scheduled('2030-05-10 18:29:00+00');   -- dentro de la ventana: se recupera
  assert pg_temp.n_avisos('event:' || v_e2 || ':%') = 2, 'FALLO: no recupera un aviso perdido hace < 30 min';

  -- E3: evento solo de m1 → solo a m1
  insert into public.events (couple_id, title, start_date, start_time, reminder_minutes, attendees, created_by)
  values (v_c, 'Dentista', '2030-05-12', '12:00', 0, 'm1', v_a) returning id into v_e3;
  perform private.enqueue_scheduled('2030-05-12 10:05:00+00');
  assert pg_temp.n_avisos('event:' || v_e3 || ':%', v_a) = 1 and pg_temp.n_avisos('event:' || v_e3 || ':%', v_b) = 0,
         'FALLO: un evento de m1 solo avisa a m1';

  -- E7: evento SECRETO → 0 filas para la pareja (y ningún texto suyo en su cola)
  insert into public.events (couple_id, title, start_date, start_time, reminder_minutes, is_secret, created_by)
  values (v_c, 'Sorpresa para María', '2030-07-01', '12:00', 0, true, v_a) returning id into v_e7;
  perform private.enqueue_scheduled('2030-07-01 10:05:00+00');
  assert pg_temp.n_avisos('event:' || v_e7 || ':%', v_a) = 1, 'FALLO: el creador de un secreto debe recibir su aviso';
  assert pg_temp.n_avisos('event:' || v_e7 || ':%', v_b) = 0, 'FALLO: aviso de un evento secreto a la pareja';
  assert not exists (select 1 from public.push_outbox where user_id = v_b and (title like '%Sorpresa%' or body like '%Sorpresa%')), 'FALLO: el título de un secreto llegó a la cola de la pareja';

  -- E8: preferencia notify_events desactivada → 0 filas para esa persona
  update public.couple_members set notify_events = false where user_id = v_b;
  insert into public.events (couple_id, title, start_date, start_time, reminder_minutes, created_by)
  values (v_c, 'Paseo', '2030-08-01', '12:00', 0, v_a) returning id into v_e8;
  perform private.enqueue_scheduled('2030-08-01 10:05:00+00');
  assert pg_temp.n_avisos('event:' || v_e8 || ':%', v_a) = 1 and pg_temp.n_avisos('event:' || v_e8 || ':%', v_b) = 0,
         'FALLO: notify_events desactivado no se respeta';
  update public.couple_members set notify_events = true where user_id = v_b;

  -- E9: evento creado después del instante del aviso → 0 (updated_at real es posterior a 2020)
  insert into public.events (couple_id, title, start_date, start_time, reminder_minutes, created_by)
  values (v_c, 'Creado tarde', '2020-01-01', '10:00', 0, v_a) returning id into v_e9;   -- aviso a las 09:00 UTC de 2020
  perform private.enqueue_scheduled('2020-01-01 09:05:00+00');
  assert pg_temp.n_avisos('event:' || v_e9 || ':%') = 0, 'FALLO: avisa de un evento creado después del instante';

  -- un miembro que se fue no recibe nada
  update public.couple_members set left_at = now() where user_id = v_b;
  insert into public.events (couple_id, title, start_date, start_time, reminder_minutes, created_by)
  values (v_c, 'Con uno fuera', '2030-08-02', '12:00', 0, v_a) returning id into v_e9;
  perform private.enqueue_scheduled('2030-08-02 10:05:00+00');
  assert pg_temp.n_avisos('event:' || v_e9 || ':%', v_a) = 1 and pg_temp.n_avisos('event:' || v_e9 || ':%', v_b) = 0,
         'FALLO: aviso a un miembro que se fue';
  update public.couple_members set left_at = null where user_id = v_b;
end $$;

-- B3. Todo el día con cambio de hora, semanal con fecha anulada, cumpleaños (29 de febrero)
do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000c1';
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_b constant uuid := '00000000-0000-4000-8000-0000000000a2';
  v_e4 uuid; v_e5 uuid; v_e6 uuid;
begin
  -- E4: evento de todo el día el 1 abr 2030 (el cambio de hora fue el 31 mar) con aviso 2340 min antes
  -- (= dos días antes a las 9:00 locales). Hora de pared: 30 mar 09:00 CET = 08:00 UTC.
  -- (Restando minutos reales saldrían las 07:00 UTC: una hora antes.)
  insert into public.events (couple_id, title, start_date, all_day, reminder_minutes, created_by)
  values (v_c, 'Escapada', '2030-04-01', true, 2340, v_a) returning id into v_e4;
  perform private.enqueue_scheduled('2030-03-30 07:10:00+00');
  assert pg_temp.n_avisos('event:' || v_e4 || ':%') = 0, 'FALLO: aviso de todo el día con minutos reales (no hora de pared)';
  perform private.enqueue_scheduled('2030-03-30 08:10:00+00');
  assert pg_temp.n_avisos('event:' || v_e4 || ':%', v_a) = 1 and pg_temp.n_avisos('event:' || v_e4 || ':%', v_b) = 1, 'FALLO: aviso de todo el día a las 9:00 locales';
  assert (select body from public.push_outbox where dedupe_key like 'event:' || v_e4 || ':%' and user_id = v_a) = 'En 2 días', 'FALLO: texto de todo el día';

  -- E5: semanal los lunes 10:00 (08:00 UTC en verano) con el lunes 10 jun anulado
  insert into public.events (couple_id, title, start_date, start_time, reminder_minutes, recurrence, created_by)
  values (v_c, 'Clase', '2030-06-03', '10:00', 0, 'weekly', v_a) returning id into v_e5;
  insert into public.event_exceptions (event_id, couple_id, occurrence_date) values (v_e5, v_c, '2030-06-10');
  perform private.enqueue_scheduled('2030-06-03 08:05:00+00');
  perform private.enqueue_scheduled('2030-06-10 08:05:00+00');
  perform private.enqueue_scheduled('2030-06-17 08:05:00+00');
  assert pg_temp.n_avisos('event:' || v_e5 || ':2030-06-03:%') = 2, 'FALLO: falta el aviso del 3 jun';
  assert pg_temp.n_avisos('event:' || v_e5 || ':2030-06-10:%') = 0, 'FALLO: avisa de una fecha anulada';
  assert pg_temp.n_avisos('event:' || v_e5 || ':2030-06-17:%') = 2, 'FALLO: falta el aviso del 17 jun';

  -- E6: cumpleaños del 29 feb (año ancla 2000), de parte de m1: aviso a LOS DOS, el día antes a las 9:00.
  -- 2030 no es bisiesto → el cumple cae el 28 feb; 2032 sí → el 29.
  insert into public.events (couple_id, title, start_date, all_day, reminder_minutes, recurrence, attendees, category, birth_year, created_by)
  values (v_c, 'Lucía', '2000-02-29', true, 900, 'yearly', 'm1', 'birthday', 1990, v_a) returning id into v_e6;
  perform private.enqueue_scheduled('2030-02-27 08:05:00+00');
  assert pg_temp.n_avisos('event:' || v_e6 || ':2030-02-28:%', v_a) = 1 and pg_temp.n_avisos('event:' || v_e6 || ':2030-02-28:%', v_b) = 1,
         'FALLO: el cumpleaños del 29 feb en año no bisiesto debe avisar a los dos el 27 feb';
  assert (select title || ' | ' || body || ' | ' || kind from public.push_outbox where dedupe_key like 'event:' || v_e6 || ':2030-02-28:%' and user_id = v_b)
         = 'Mañana es el cumpleaños de Lucía | Cumple 40 | birthday', 'FALLO: texto del cumpleaños';
  perform private.enqueue_scheduled('2032-02-28 08:05:00+00');
  assert pg_temp.n_avisos('event:' || v_e6 || ':2032-02-29:%') = 2, 'FALLO: cumpleaños del 29 feb en año bisiesto';
  assert (select body from public.push_outbox where dedupe_key like 'event:' || v_e6 || ':2032-02-29:%' and user_id = v_a) = 'Cumple 42', 'FALLO: edad del cumpleaños bisiesto';
end $$;

-- B4. Cobros recurrentes: próximo, el mismo día con el cobro ya creado, variable pendiente, privado, pausa, preferencia
do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000c1';
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_b constant uuid := '00000000-0000-4000-8000-0000000000a2';
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_p4 uuid; v_p5 uuid; v_o2 uuid; v_o4 uuid;
  v_rec public.recurring_payments;
  v_tot integer;
begin
  -- P1: Netflix, mensual el 15, aviso 1 día antes → 14 mar 09:00 CET = 08:00 UTC
  insert into public.recurring_payments (couple_id, name, amount_cents, frequency, day_of_month, paid_by, split_mode, reminder_days, created_by)
  values (v_c, 'Netflix', 1299, 'monthly', 15, 'm1', 'half', 1, v_a) returning id into v_p1;
  perform private.enqueue_scheduled('2030-03-14 08:05:00+00');
  assert pg_temp.n_avisos('payment_due:' || v_p1 || ':%', v_a) = 1 and pg_temp.n_avisos('payment_due:' || v_p1 || ':%', v_b) = 1, 'FALLO: cobro compartido debe avisar a los dos';
  assert (select title || ' | ' || body || ' | ' || url from public.push_outbox where dedupe_key like 'payment_due:' || v_p1 || ':%' and user_id = v_b)
         = 'Mañana se cobra Netflix | 12,99 € | /gastos/recurrente/' || v_p1, 'FALLO: texto del cobro';
  select count(*) into v_tot from public.push_outbox where couple_id = v_c;
  perform private.enqueue_scheduled('2030-03-14 08:05:00+00');
  perform private.enqueue_scheduled('2030-03-14 08:20:00+00');
  assert (select count(*) from public.push_outbox where couple_id = v_c) = v_tot, 'FALLO: cobro duplicado al ejecutar dos veces';

  -- P2: Luz variable (≈ 60 €), mensual el 20, aviso «el mismo día». El job ya ha creado el cobro (pendiente):
  -- los previstos NO lo devuelven, así que el aviso sale del cobro creado.
  insert into public.recurring_payments (couple_id, name, amount_cents, is_variable, frequency, day_of_month, paid_by, split_mode, reminder_days, created_by)
  values (v_c, 'Luz', 6000, true, 'monthly', 20, 'm1', 'half', 0, v_a) returning id into v_p2;
  insert into public.recurring_occurrences (couple_id, recurring_id, due_date) values (v_c, v_p2, '2030-04-20') returning id into v_o2;
  select * into v_rec from public.recurring_payments where id = v_p2;
  assert not exists (select 1 from private.planned_payment_dates(v_rec, date '2030-04-20', date '2030-04-20', date '2030-04-23')),
         'FALLO: los previstos no deben incluir el cobro ya creado';
  perform private.enqueue_scheduled('2030-04-20 07:05:00+00');   -- 9:00 CEST
  assert pg_temp.n_avisos('payment_due:' || v_p2 || ':2030-04-20:%') = 2, 'FALLO: el aviso del mismo día no cuenta el cobro ya creado';
  assert (select title || ' | ' || body from public.push_outbox where dedupe_key like 'payment_due:' || v_p2 || ':%' and user_id = v_a)
         = 'Hoy se cobra Luz | ≈ 60 €', 'FALLO: texto del cobro variable';
  -- importe variable pendiente: a las 9:00 del día siguiente
  perform private.enqueue_scheduled('2030-04-21 07:05:00+00');
  assert pg_temp.n_avisos('variable:' || v_o2 || ':%') = 2, 'FALLO: falta el aviso de importe variable pendiente';
  assert (select title from public.push_outbox where dedupe_key like 'variable:' || v_o2 || ':%' and user_id = v_a) = 'Falta el importe de Luz', 'FALLO: texto del importe variable';
  -- ya resuelto: no avisa
  update public.recurring_occurrences set status = 'paid', amount_cents = 5800 where id = v_o2;
  delete from public.push_outbox where dedupe_key like 'variable:' || v_o2 || ':%';
  perform private.enqueue_scheduled('2030-04-21 07:05:00+00');
  assert pg_temp.n_avisos('variable:' || v_o2 || ':%') = 0, 'FALLO: avisa de un importe ya puesto';

  -- P3: recurrente PRIVADO (solo de a) → 0 filas para la pareja
  insert into public.recurring_payments (couple_id, name, amount_cents, frequency, day_of_month, paid_by, split_mode, reminder_days, visible_to_partner, created_by)
  values (v_c, 'Regalo secreto', 2000, 'monthly', 10, 'm1', 'only_m1', 0, false, v_a) returning id into v_p3;
  perform private.enqueue_scheduled('2030-05-10 07:05:00+00');
  assert pg_temp.n_avisos('payment_due:' || v_p3 || ':%', v_a) = 1, 'FALLO: el dueño de un recurrente privado debe recibir el aviso';
  assert pg_temp.n_avisos('payment_due:' || v_p3 || ':%', v_b) = 0, 'FALLO: aviso de un recurrente privado a la pareja';
  assert not exists (select 1 from public.push_outbox where user_id = v_b and title like '%Regalo secreto%'), 'FALLO: el nombre de un recurrente privado llegó a la pareja';

  -- P4: recurrente EN PAUSA (con su cobro de hoy ya creado) → 0
  insert into public.recurring_payments (couple_id, name, amount_cents, frequency, day_of_month, paid_by, split_mode, reminder_days, paused, created_by)
  values (v_c, 'Gimnasio', 3000, 'monthly', 11, 'm1', 'half', 0, true, v_a) returning id into v_p4;
  insert into public.recurring_occurrences (couple_id, recurring_id, due_date) values (v_c, v_p4, '2030-05-11') returning id into v_o4;
  perform private.enqueue_scheduled('2030-05-11 07:05:00+00');
  perform private.enqueue_scheduled('2030-05-12 07:05:00+00');   -- y el aviso de importe pendiente del día siguiente
  assert pg_temp.n_avisos('payment_due:' || v_p4 || ':%') = 0, 'FALLO: avisa de un recurrente en pausa';
  assert pg_temp.n_avisos('variable:' || v_o4 || ':%') = 0, 'FALLO: avisa del importe pendiente de un recurrente en pausa';

  -- P5: notify_payment_reminder desactivado → 0 filas para esa persona
  update public.couple_members set notify_payment_reminder = false where user_id = v_b;
  insert into public.recurring_payments (couple_id, name, amount_cents, frequency, day_of_month, paid_by, split_mode, reminder_days, created_by)
  values (v_c, 'Seguro', 4000, 'monthly', 12, 'm1', 'half', 0, v_a) returning id into v_p5;
  perform private.enqueue_scheduled('2030-05-12 07:05:00+00');
  assert pg_temp.n_avisos('payment_due:' || v_p5 || ':%', v_a) = 1 and pg_temp.n_avisos('payment_due:' || v_p5 || ':%', v_b) = 0,
         'FALLO: notify_payment_reminder desactivado no se respeta';
  update public.couple_members set notify_payment_reminder = true where user_id = v_b;
end $$;

-- B5. «¿Quién pagó?»
do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000c1';
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_b constant uuid := '00000000-0000-4000-8000-0000000000a2';
  v_w1 uuid; v_w2 uuid; v_w3 uuid;
begin
  -- W1: cena 20:00 (termina 21:30, aviso 21:45 locales = 19:45 UTC)
  insert into public.events (couple_id, title, start_date, start_time, ask_who_paid, created_by)
  values (v_c, 'Cena fuera', '2030-09-10', '20:00', true, v_a) returning id into v_w1;
  perform private.enqueue_scheduled('2030-09-10 19:50:00+00');
  assert pg_temp.n_avisos('who_paid:' || v_w1 || ':%') = 2, 'FALLO: falta el aviso «¿Quién pagó?»';
  assert (select title || ' | ' || body || ' | ' || kind from public.push_outbox where dedupe_key like 'who_paid:' || v_w1 || ':%' and user_id = v_b)
         = '¿Quién pagó? | Cena fuera | who_paid', 'FALLO: texto de «¿Quién pagó?»';

  -- W2: termina 22:30 → el aviso cae a las 22:45 → se pasa a las 9:00 del día siguiente (07:00 UTC)
  insert into public.events (couple_id, title, start_date, start_time, end_time, ask_who_paid, created_by)
  values (v_c, 'Concierto', '2030-09-10', '21:00', '22:30', true, v_a) returning id into v_w2;
  perform private.enqueue_scheduled('2030-09-10 20:50:00+00');
  assert pg_temp.n_avisos('who_paid:' || v_w2 || ':%') = 0, 'FALLO: avisa «¿Quién pagó?» de noche';
  perform private.enqueue_scheduled('2030-09-11 07:05:00+00');
  assert pg_temp.n_avisos('who_paid:' || v_w2 || ':%') = 2, 'FALLO: falta el aviso de la mañana siguiente';

  -- W3: ya resuelto → 0; secreto → solo quien lo creó
  insert into public.events (couple_id, title, start_date, start_time, ask_who_paid, who_paid_resolved_at, created_by)
  values (v_c, 'Resuelta', '2030-09-13', '20:00', true, now(), v_a) returning id into v_w3;
  perform private.enqueue_scheduled('2030-09-13 19:50:00+00');
  assert pg_temp.n_avisos('who_paid:' || v_w3 || ':%') = 0, 'FALLO: avisa de un «¿Quién pagó?» resuelto';
  insert into public.events (couple_id, title, start_date, start_time, ask_who_paid, is_secret, created_by)
  values (v_c, 'Cena sorpresa', '2030-09-12', '12:00', true, true, v_a) returning id into v_w3;   -- termina 13:30 → aviso 13:45 locales = 11:45 UTC
  perform private.enqueue_scheduled('2030-09-12 11:50:00+00');
  assert pg_temp.n_avisos('who_paid:' || v_w3 || ':%', v_a) = 1 and pg_temp.n_avisos('who_paid:' || v_w3 || ':%', v_b) = 0,
         'FALLO: «¿Quién pagó?» de un secreto debe ir solo a quien lo creó';

  -- preferencia notify_who_paid desactivada
  update public.couple_members set notify_who_paid = false where user_id = v_b;
  insert into public.events (couple_id, title, start_date, start_time, ask_who_paid, created_by)
  values (v_c, 'Brunch', '2030-09-14', '10:00', true, v_a) returning id into v_w3;
  perform private.enqueue_scheduled('2030-09-14 09:50:00+00');   -- termina 11:30 → 11:45 locales = 09:45 UTC
  assert pg_temp.n_avisos('who_paid:' || v_w3 || ':%', v_a) = 1 and pg_temp.n_avisos('who_paid:' || v_w3 || ':%', v_b) = 0,
         'FALLO: notify_who_paid desactivado no se respeta';
  update public.couple_members set notify_who_paid = true where user_id = v_b;
end $$;

-- B6. calendar_range no ha cambiado: los previstos de planned_payment_dates son exactamente los de la regla anterior
do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000c1';
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_today date := private.couple_today('00000000-0000-4000-8000-0000000000c1');
  v_from  date := current_date;
  v_to    date := current_date + 100;
  v_diff  integer;
  v_nuevo integer;
  v_cal   integer;
  v_priv  integer;
begin
  -- recurrentes de todos los tipos, con cobros ya creados que pisan el día o el mes
  insert into public.recurring_payments (couple_id, name, amount_cents, frequency, day_of_month, month_of_year, start_date, paid_by, split_mode, created_by) values
    (v_c, 'Mensual 28', 1000, 'monthly', 28, null, current_date - 400, 'm1', 'half', v_a),
    (v_c, 'Mensual 31', 1000, 'monthly', 31, null, current_date - 400, 'm1', 'half', v_a),
    (v_c, 'Anual', 1000, 'yearly', 15, extract(month from current_date + 40)::smallint, current_date - 800, 'm1', 'half', v_a),
    (v_c, 'Puntual', 1000, 'once', null, null, current_date + 20, 'm1', 'half', v_a);
  insert into public.recurring_payments (couple_id, name, amount_cents, frequency, day_of_month, paid_by, split_mode, paused, created_by)
  values (v_c, 'Pausado', 1000, 'monthly', 5, 'm1', 'half', true, v_a);
  -- un cobro de hoy en un mensual con otro día: ese mes no debe repetirse
  insert into public.recurring_occurrences (couple_id, recurring_id, due_date)
  select v_c, id, current_date from public.recurring_payments where couple_id = v_c and name = 'Mensual 28';

  select count(*) into v_diff from (
    (select r.id, d.d from public.recurring_payments r
       cross join lateral private.planned_payment_dates(r, v_today, v_from, v_to) as d(d)
      where r.couple_id = v_c
     except
     select r.id, d.d from public.recurring_payments r
       cross join lateral private.payment_due_dates(r.frequency, r.day_of_month, r.month_of_year, r.start_date, r.end_date,
                                                    greatest(v_from, v_today, r.active_from), v_to) as d(d)
      where r.couple_id = v_c and not r.paused and greatest(v_from, v_today, r.active_from) <= v_to
        and not exists (
          select 1 from public.recurring_occurrences o
          where o.recurring_id = r.id
            and (o.due_date = d.d
                 or (o.due_date >= r.active_from
                     and (r.frequency = 'once'
                          or (r.frequency = 'monthly' and date_trunc('month', o.due_date::timestamp) = date_trunc('month', d.d::timestamp))
                          or (r.frequency = 'yearly' and extract(year from o.due_date) = extract(year from d.d)))))))
    union all
    (select r.id, d.d from public.recurring_payments r
       cross join lateral private.payment_due_dates(r.frequency, r.day_of_month, r.month_of_year, r.start_date, r.end_date,
                                                    greatest(v_from, v_today, r.active_from), v_to) as d(d)
      where r.couple_id = v_c and not r.paused and greatest(v_from, v_today, r.active_from) <= v_to
        and not exists (
          select 1 from public.recurring_occurrences o
          where o.recurring_id = r.id
            and (o.due_date = d.d
                 or (o.due_date >= r.active_from
                     and (r.frequency = 'once'
                          or (r.frequency = 'monthly' and date_trunc('month', o.due_date::timestamp) = date_trunc('month', d.d::timestamp))
                          or (r.frequency = 'yearly' and extract(year from o.due_date) = extract(year from d.d))))))
     except
     select r.id, d.d from public.recurring_payments r
       cross join lateral private.planned_payment_dates(r, v_today, v_from, v_to) as d(d)
      where r.couple_id = v_c)
  ) z;
  assert v_diff = 0, 'FALLO: planned_payment_dates difiere de la regla anterior de calendar_range (' || v_diff || ' diferencias)';

  select count(*) into v_nuevo from public.recurring_payments r
    cross join lateral private.planned_payment_dates(r, v_today, v_from, v_to) as d(d)
   where r.couple_id = v_c and r.show_in_calendar;
  assert v_nuevo > 5, 'FALLO: la prueba de previstos no tiene datos suficientes';
  assert (select count(*) from public.recurring_payments r
            cross join lateral private.planned_payment_dates(r, v_today, v_from, v_to) as d(d)
           where r.couple_id = v_c and r.name = 'Pausado') = 0, 'FALLO: un pausado tiene pagos previstos';

  -- y calendar_range, llamada como la app (rol authenticated, con su RLS), devuelve exactamente esos previstos:
  -- a (dueña de todos) los ve todos; b no ve los del recurrente privado «Regalo secreto» (B4).
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into v_cal from public.calendar_range(v_from, v_to) cr where cr.kind = 'payment' and cr.status = 'scheduled';
  reset role;
  assert v_cal = v_nuevo, 'FALLO: calendar_range devuelve ' || v_cal || ' pagos previstos y planned_payment_dates ' || v_nuevo;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into v_cal from public.calendar_range(v_from, v_to) cr where cr.kind = 'payment' and cr.status = 'scheduled';
  select count(*) into v_priv from public.calendar_range(v_from, v_to) cr where cr.title = 'Regalo secreto';
  reset role;
  assert v_priv = 0, 'FALLO: calendar_range enseña a la pareja un recurrente privado';
  assert v_cal = (select count(*) from public.recurring_payments r
                    cross join lateral private.planned_payment_dates(r, v_today, v_from, v_to) as d(d)
                   where r.couple_id = v_c and r.show_in_calendar and r.visible_to_partner),
         'FALLO: calendar_range de la pareja no devuelve los previstos compartidos (' || v_cal || ')';
end $$;

-- B7. Programados sin errores sobre los datos reales (devuelve un número y no lanza)
do $$
begin
  assert private.enqueue_scheduled(now()) >= 0, 'FALLO: enqueue_scheduled(now()) debe devolver un número';
  raise notice 'PRUEBAS DE AVISOS (fase 3): todas correctas';
end $$;

rollback;
