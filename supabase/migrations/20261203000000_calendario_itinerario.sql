-- =============================================================================
-- ito · Calendario: los elementos del itinerario de un plan salen en el calendario como eventos
-- (docs/plan-planificador.md §4 «Calendario»; docs/modelo-datos.md)
--
-- Hasta ahora calendar_range EXCLUÍA los eventos con plan_id (el plan solo se veía como banda). Ahora devuelve
-- también los elementos del itinerario como filas kind = 'event' normales (su día, hora, «todo el día», sitio,
-- categoría), además de la banda kind = 'plan' de siempre.
--   · Único cambio: se quita `and e.plan_id is null` del bloque de eventos (y su comentario). Firma, columnas, tipos,
--     orden de columnas, orden de filas (order by 3, 7 nulls first, 5), filtros de pagos y de planes, security
--     invoker y search_path = '' quedan IGUAL: create or replace conserva permisos y dependencias (se repiten el
--     revoke/grant de siempre por si acaso).
--   · Sin columnas nuevas: la salida YA trae plan_id (en eventos, events.plan_id; en la banda, el id del plan).
--   · Visibilidad: la de siempre, por la RLS de events (invoker): los dos miembros de la pareja ven los elementos de
--     sus planes (un elemento de un plan nunca es secreto, CHECK de events); nadie de fuera de la pareja.
--   · Sin duplicados: un elemento del itinerario no se repite (CHECK events_plan_sin_repetir), así que sale UNA fila
--     por elemento (la de su primer día, con ends_on = su último día), aunque empiece antes del rango.
--
-- Datos de producción (consultado en solo lectura el 2026-11-21): 0 eventos, 0 planes, 0 pagos recurrentes.
-- calendar_range de producción comparada con pg_get_functiondef: idéntica a 20261124000000_avisos_programados.sql
-- (sin dependencias en pg_depend; authenticated la ejecuta, anon no).
--
-- Contrato para la app:
--   · Fila de un elemento del itinerario: kind = 'event' y plan_id no null. La banda del plan: kind = 'plan'
--     (source_id = plan_id). Añadir `plan_id?: string | null` a FilaRango (lib/calendario/agrupar.ts); hoy no lo
--     declara pero el servidor ya lo manda.
--   · Como antes, en eventos icon es null (el icono sale de category) y NO vienen time_slot, position ni reserved:
--     un elemento con franja (Mañana/Tarde/Noche) llega con start_time null y all_day false. Si el calendario quiere
--     enseñar la franja o «Reservado», se leen de events por id (COLUMNAS_ITINERARIO), como ya hace Inicio con la
--     reserva; no se amplía la salida (cambiar columnas exige drop + create y re-conceder permisos).
--   · Tocar un elemento: su detalle de evento (/calendario/evento/<id>) o el plan (/planificador/<plan_id>?dia=).
--   · Ahora cuentan en la rejilla, «+N», la lista, los filtros por categoría y la agenda de Inicio (useInicio usa
--     calendar_range): revisar que «Esta semana» y los conteos no repitan un día (banda + sus elementos) si no se quiere.
--   · Mientras la app no se actualice, los elementos del itinerario aparecen como eventos sueltos (sin decir de qué
--     plan son): aplicar la migración junto con el cambio de la app.
--
-- Requiere 20261201000000_itinerario.sql (CHECK events_plan_sin_repetir).
-- Idempotente. La parte A (cambios) va en su transacción y la parte B (pruebas) acaba en ROLLBACK.
-- Funciona entero en el SQL Editor o con `supabase db query --remote -f`.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Requisitos (si algo falla, no se cambia nada)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass
                 and conname = 'events_plan_sin_repetir') then
    raise exception 'Aplica antes 20261201000000_itinerario.sql';
  end if;
  if pg_get_function_result('public.calendar_range(date, date)'::regprocedure) <>
     'TABLE(kind text, source_id uuid, occurs_on date, ends_on date, title text, icon text, start_time time without time zone, all_day boolean, place_id uuid, plan_id uuid, amount_cents integer, is_estimate boolean, status text, recurrence text, attendees text, is_secret boolean, occurrence_id uuid, category text, birth_year smallint)' then
    raise exception 'calendar_range no tiene las columnas esperadas: compárala antes';
  end if;
  if not exists (select 1 from pg_proc where oid = 'public.calendar_range(date, date)'::regprocedure
                 and prosrc like '%planned_payment_dates%') then
    raise exception 'calendar_range no es la de 20261124000000_avisos_programados.sql: compárala antes';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. calendar_range: idéntica a la de producción (= 20261124000000_avisos_programados.sql) salvo el bloque de
--    eventos, que ya no excluye los de un plan (marcado [Calendario itinerario]).
-- -----------------------------------------------------------------------------
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
  -- Eventos (repeticiones expandidas, sin las fechas anuladas). [Calendario itinerario] También los elementos del
  -- itinerario de un plan (plan_id no null), además de la banda del plan: nunca se repiten (CHECK events_plan_sin_repetir).
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

revoke all on function public.calendar_range(date, date) from public, anon;
grant execute on function public.calendar_range(date, date) to authenticated;

commit;

-- =============================================================================
-- PARTE B · Pruebas (no dejan nada: todo acaba en ROLLBACK). Ejecutar como postgres.
-- Si una prueba falla, el script se detiene con «FALLO: ...» y la parte A ya está aplicada.
-- Lecturas «de la app» con set local role authenticated y auth.uid() simulado con request.jwt.claims (se aplica la
-- RLS); las comprobaciones, como postgres. No cambia la estructura de ninguna tabla ni toca filas reales: dos
-- parejas y cuatro usuarios de prueba.
--   Ana (…0000000000e1, m1) y Beto (…0000000000e2, m2) en la pareja …00000000c001; Ciro (…0000000000e3, sin pareja);
--   Dani (…0000000000e4, m1, solo) en la pareja …00000000c002.
-- =============================================================================
begin;
set local idle_in_transaction_session_timeout = '60s';

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000e1', 'calit-a@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e2', 'calit-b@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e3', 'calit-c@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e4', 'calit-d@prueba.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-0000000000e1', 'Ana'),
  ('00000000-0000-4000-8000-0000000000e2', 'Beto'),
  ('00000000-0000-4000-8000-0000000000e3', 'Ciro'),
  ('00000000-0000-4000-8000-0000000000e4', 'Dani')
on conflict (id) do update set display_name = excluded.display_name;
insert into public.couples (id) values ('00000000-0000-4000-8000-00000000c001'), ('00000000-0000-4000-8000-00000000c002');
insert into public.couple_settings (couple_id) values
  ('00000000-0000-4000-8000-00000000c001'), ('00000000-0000-4000-8000-00000000c002') on conflict do nothing;
insert into public.couple_members (couple_id, user_id, slot) values
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000e1', 'm1'),
  ('00000000-0000-4000-8000-00000000c001', '00000000-0000-4000-8000-0000000000e2', 'm2'),
  ('00000000-0000-4000-8000-00000000c002', '00000000-0000-4000-8000-0000000000e4', 'm1');

-- Datos de prueba. Ana: plan P «Lisboa» (1–4 jun 2030) con I1 «Tranvía 28» (2 jun 21:30, con sitio), I2 «Cascais»
-- (3–4 jun, franja mañana) e I3 «Sintra» (4 jun, todo el día); sueltos: «Yoga» semanal desde el lunes 6 may con el
-- 10 jun anulado, cumpleaños de Marta (2 jun, nació en 1990; año ancla 2000), «Congreso» (30 may – 2 jun) y «Sorpresa» secreto (5 jun);
-- pago recurrente «Netflix» (día 15). Dani: plan Q (1–4 jun) con «Ajeno» (2 jun).
do $$
declare
  v_c1 constant uuid := '00000000-0000-4000-8000-00000000c001';
  v_c2 constant uuid := '00000000-0000-4000-8000-00000000c002';
  v_p  constant uuid := '00000000-0000-4000-8000-00000000a001';
  v_q  constant uuid := '00000000-0000-4000-8000-00000000a002';
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.plans (id, couple_id, type, name, icon, start_date, end_date) values
    (v_p, v_c1, 'trip', 'Lisboa', '✈️', '2030-06-01', '2030-06-04');
  insert into public.places (id, couple_id, name, lat, lng, provider, visible_to_partner) values
    ('00000000-0000-4000-8000-00000000a201', v_c1, 'Miradouro', 38.71, -9.13, 'manual', true);
  insert into public.events (id, couple_id, title, start_date, start_time, plan_id, place_id, category) values
    ('00000000-0000-4000-8000-00000000a101', v_c1, 'Tranvía 28', '2030-06-02', '21:30', v_p,
     '00000000-0000-4000-8000-00000000a201', 'leisure');
  insert into public.events (id, couple_id, title, start_date, end_date, time_slot, plan_id, category) values
    ('00000000-0000-4000-8000-00000000a102', v_c1, 'Cascais', '2030-06-03', '2030-06-04', 'morning', v_p, 'trip');
  insert into public.events (id, couple_id, title, start_date, all_day, plan_id) values
    ('00000000-0000-4000-8000-00000000a103', v_c1, 'Sintra', '2030-06-04', true, v_p);
  insert into public.events (id, couple_id, title, start_date, start_time, recurrence) values
    ('00000000-0000-4000-8000-00000000a111', v_c1, 'Yoga', '2030-05-06', '19:00', 'weekly');
  insert into public.events (id, couple_id, title, start_date, all_day, recurrence, category, birth_year) values
    ('00000000-0000-4000-8000-00000000a112', v_c1, 'Marta', '2000-06-02', true, 'yearly', 'birthday', 1990);
  insert into public.events (id, couple_id, title, start_date, end_date, all_day) values
    ('00000000-0000-4000-8000-00000000a113', v_c1, 'Congreso', '2030-05-30', '2030-06-02', true);
  insert into public.events (id, couple_id, title, start_date, is_secret) values
    ('00000000-0000-4000-8000-00000000a114', v_c1, 'Sorpresa', '2030-06-05', true);

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e4","role":"authenticated"}', true);
  insert into public.plans (id, couple_id, type, name, icon, start_date, end_date) values
    (v_q, v_c2, 'trip', 'Roma', '🍝', '2030-06-01', '2030-06-04');
  insert into public.events (id, couple_id, title, start_date, plan_id) values
    ('00000000-0000-4000-8000-00000000a121', v_c2, 'Ajeno', '2030-06-02', v_q);
  reset role;
  perform set_config('request.jwt.claims', '{}', true);

  -- Como postgres: la app anula una fecha con request_deletion (las excepciones no se insertan directamente).
  insert into public.event_exceptions (event_id, couple_id, occurrence_date) values
    ('00000000-0000-4000-8000-00000000a111', v_c1, '2030-06-10');
  insert into public.recurring_payments (id, couple_id, name, amount_cents, frequency, day_of_month, paid_by, split_mode, created_by)
  values ('00000000-0000-4000-8000-00000000a301', v_c1, 'Netflix', 1299, 'monthly', 15, 'm1', 'half',
          '00000000-0000-4000-8000-0000000000e1');
end $$;

-- Filas de calendar_range guardadas en jsonb → tabla (mismas columnas que la función)
create function pg_temp.filas(p jsonb)
returns table (kind text, source_id uuid, occurs_on date, ends_on date, title text, icon text, start_time time,
               all_day boolean, place_id uuid, plan_id uuid, amount_cents integer, is_estimate boolean, status text,
               recurrence text, attendees text, is_secret boolean, occurrence_id uuid, category text, birth_year smallint)
language sql immutable as $$
  select * from jsonb_to_recordset(p) as x(kind text, source_id uuid, occurs_on date, ends_on date, title text,
    icon text, start_time time, all_day boolean, place_id uuid, plan_id uuid, amount_cents integer,
    is_estimate boolean, status text, recurrence text, attendees text, is_secret boolean, occurrence_id uuid,
    category text, birth_year smallint)
$$;

-- B1. Estructura y permisos: misma firma y columnas, invoker, search_path vacío, permisos de siempre
do $$
begin
  assert pg_get_function_result('public.calendar_range(date, date)'::regprocedure) =
         'TABLE(kind text, source_id uuid, occurs_on date, ends_on date, title text, icon text, start_time time without time zone, all_day boolean, place_id uuid, plan_id uuid, amount_cents integer, is_estimate boolean, status text, recurrence text, attendees text, is_secret boolean, occurrence_id uuid, category text, birth_year smallint)',
         'FALLO: calendar_range cambió de columnas';
  assert (select not prosecdef and provolatile = 's' and proconfig @> array['search_path=""']
                 and prosrc like '%[Calendario itinerario]%' and prosrc not like '%plan_id is null%'
                 and prosrc like '%planned_payment_dates(r, v_today, p_from, p_to)%'
                 and prosrc like '%order by 3, 7 nulls first, 5%'
          from pg_proc where oid = 'public.calendar_range(date, date)'::regprocedure),
         'FALLO: calendar_range no es la esperada (invoker, stable, search_path vacío, sin exclusión de plan_id)';
  assert has_function_privilege('authenticated', 'public.calendar_range(date, date)', 'execute')
     and not has_function_privilege('anon', 'public.calendar_range(date, date)', 'execute'),
         'FALLO: permisos de calendar_range';
end $$;

-- B2. Ana: elementos del itinerario (una fila cada uno), banda, repetidos, cumpleaños, varios días, secreto y pagos
do $$
declare
  v_p   constant uuid := '00000000-0000-4000-8000-00000000a001';
  v_n   integer;
  v_r   record;
  v_rows jsonb;
  v_mes  jsonb;
  v_dia  jsonb;
begin
  -- Lo que recibe la app (Ana, con su RLS), guardado en jsonb; las comprobaciones, como postgres.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
  set local role authenticated;
  select coalesce(jsonb_agg(to_jsonb(r)), '[]') into v_mes from public.calendar_range('2030-06-01', '2030-06-30') r;
  select coalesce(jsonb_agg(to_jsonb(r)), '[]') into v_dia from public.calendar_range('2030-06-04', '2030-06-04') r;
  reset role;
  create temp table cr_ana on commit drop as select * from pg_temp.filas(v_mes);
  create temp table cr_ana_4 on commit drop as select * from pg_temp.filas(v_dia);
  create temp table cr_pagos on commit drop as
    select d.d from public.recurring_payments r
    cross join lateral private.planned_payment_dates(r, private.couple_today(r.couple_id), '2030-06-01', '2030-06-30') as d(d)
    where r.id = '00000000-0000-4000-8000-00000000a301';

  -- Elementos del itinerario: kind 'event', plan_id del plan, una fila cada uno, con su hora, sitio y categoría
  select count(*) into v_n from cr_ana where kind = 'event' and plan_id = v_p;
  assert v_n = 3, 'FALLO: Ana ve ' || v_n || ' elementos del itinerario (esperados 3)';
  assert (select count(*) = 3 and count(distinct source_id) = 3 from cr_ana where kind = 'event' and plan_id = v_p),
         'FALLO: algún elemento del itinerario sale duplicado';
  assert exists (select 1 from cr_ana where source_id = '00000000-0000-4000-8000-00000000a101' and kind = 'event'
                 and occurs_on = '2030-06-02' and ends_on = '2030-06-02' and start_time = '21:30' and not all_day
                 and place_id = '00000000-0000-4000-8000-00000000a201' and category = 'leisure' and title = 'Tranvía 28'
                 and recurrence = 'none' and not is_secret and icon is null),
         'FALLO: el elemento a una hora no sale bien';
  assert exists (select 1 from cr_ana where source_id = '00000000-0000-4000-8000-00000000a102'
                 and occurs_on = '2030-06-03' and ends_on = '2030-06-04' and start_time is null and not all_day),
         'FALLO: el elemento de dos días con franja no sale bien';
  assert exists (select 1 from cr_ana where source_id = '00000000-0000-4000-8000-00000000a103'
                 and occurs_on = '2030-06-04' and all_day),
         'FALLO: el elemento de todo el día no sale bien';
  -- La banda del plan sigue
  assert (select count(*) = 1 from cr_ana where kind = 'plan'), 'FALLO: la banda del plan no sale una vez';
  assert exists (select 1 from cr_ana where kind = 'plan' and source_id = v_p and plan_id = v_p and icon = '✈️'
                 and occurs_on = '2030-06-01' and ends_on = '2030-06-04' and title = 'Lisboa' and all_day),
         'FALLO: la banda del plan cambió';
  -- Repetidos (lunes de junio sin el 10), cumpleaños, varios días desde antes del rango y el secreto de Ana
  select jsonb_agg(occurs_on order by occurs_on) into v_rows from cr_ana where source_id = '00000000-0000-4000-8000-00000000a111';
  assert v_rows = '["2030-06-03", "2030-06-17", "2030-06-24"]'::jsonb, 'FALLO: el evento semanal sale ' || coalesce(v_rows::text, 'vacío');
  assert (select count(*) = 1 and bool_and(occurs_on = '2030-06-02' and birth_year = 1990 and category = 'birthday'
                 and recurrence = 'yearly' and plan_id is null)
          from cr_ana where source_id = '00000000-0000-4000-8000-00000000a112'),
         'FALLO: el cumpleaños cambió';
  assert (select count(*) = 1 and bool_and(occurs_on = '2030-05-30' and ends_on = '2030-06-02' and plan_id is null)
          from cr_ana where source_id = '00000000-0000-4000-8000-00000000a113'),
         'FALLO: el evento de varios días que empieza antes del rango cambió';
  assert (select count(*) = 1 from cr_ana where source_id = '00000000-0000-4000-8000-00000000a114' and is_secret),
         'FALLO: Ana no ve su evento secreto';
  -- Pagos previstos: exactamente los de planned_payment_dates
  assert (select count(*) = 1 from cr_pagos), 'FALLO: planned_payment_dates no da un cobro en junio';
  assert not exists (select occurs_on from cr_ana where kind = 'payment' and status = 'scheduled' except select d from cr_pagos)
     and not exists (select d from cr_pagos except select occurs_on from cr_ana where kind = 'payment' and status = 'scheduled'),
         'FALLO: los pagos previstos de calendar_range no son los de planned_payment_dates';
  -- Nada de la otra pareja, y el total cuadra (3 elementos + banda + 3 yoga + cumpleaños + congreso + secreto + pago)
  assert not exists (select 1 from cr_ana where title in ('Ajeno', 'Roma')), 'FALLO: Ana ve el plan o el itinerario de Dani';
  select count(*) into v_n from cr_ana;
  assert v_n = 11, 'FALLO: Ana ve ' || v_n || ' filas en junio (esperadas 11)';

  -- Un día (4 jun): el elemento de dos días que empezó el 3 sale una vez, el de todo el día también, y la banda
  assert (select count(*) = 1 from cr_ana_4 where source_id = '00000000-0000-4000-8000-00000000a102' and occurs_on = '2030-06-03'),
         'FALLO: el elemento que empezó antes del día no sale una vez';
  assert (select count(*) = 3 from cr_ana_4 where plan_id = v_p)
     and not exists (select 1 from cr_ana_4 where source_id = '00000000-0000-4000-8000-00000000a101'),
         'FALLO: el 4 de junio no salen Cascais, Sintra y la banda (o sale el Tranvía del día 2)';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B3. Quién ve qué: Beto ve los elementos de Ana (compartidos) pero no su secreto; Dani solo lo suyo; Ciro nada
do $$
declare
  v_p   constant uuid := '00000000-0000-4000-8000-00000000a001';
  v_q   constant uuid := '00000000-0000-4000-8000-00000000a002';
  v_b   integer;
  v_bs  integer;
  v_bt  integer;
  v_d   integer;
  v_dx  integer;
  v_c   integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
  select count(*) filter (where kind = 'event' and plan_id = v_p),
         count(*) filter (where title = 'Sorpresa'),
         count(*)
    into v_b, v_bs, v_bt
  from public.calendar_range('2030-06-01', '2030-06-30');
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e4","role":"authenticated"}', true);
  select count(*) filter (where plan_id = v_q), count(*) filter (where plan_id is distinct from v_q)
    into v_d, v_dx
  from public.calendar_range('2030-06-01', '2030-06-30');
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e3","role":"authenticated"}', true);
  select count(*) into v_c from public.calendar_range('2030-06-01', '2030-06-30');
  reset role;
  perform set_config('request.jwt.claims', '{}', true);

  assert v_b = 3, 'FALLO: Beto ve ' || v_b || ' elementos del itinerario de Ana (esperados 3)';
  assert v_bs = 0, 'FALLO: Beto ve el evento secreto de Ana';
  assert v_bt = 10, 'FALLO: Beto ve ' || v_bt || ' filas en junio (esperadas 10: las de Ana sin el secreto)';
  assert v_d = 2 and v_dx = 0, 'FALLO: Dani ve ' || v_d || ' filas de su plan (esperadas 2) y ' || v_dx || ' ajenas';
  assert v_c = 0, 'FALLO: Ciro, sin pareja, ve ' || v_c || ' filas';
end $$;

-- B4. Final
do $$
begin
  raise notice 'PRUEBAS DE CALENDARIO E ITINERARIO: todas correctas';
end $$;

rollback;
