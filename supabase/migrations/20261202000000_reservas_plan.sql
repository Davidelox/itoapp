-- =============================================================================
-- ito · Planificador, fase F9: reservas enlazadas al itinerario (docs/plan-planificador.md §3 M3 y §F9)
--
-- Una reserva del plan (plan_tasks.kind = 'booking') puede enlazarse a un elemento del itinerario (event_id; que sea
-- de este plan ya lo comprueba TW060 desde F1). Qué añade:
--   1. Un elemento del itinerario tiene como mucho UNA reserva enlazada: índice único parcial
--      plan_tasks_una_reserva_por_evento (event_id) where kind = 'booking' and event_id is not null, y antes, desde la
--      app, TW072 «Este elemento ya tiene una reserva» (al crear la reserva, cambiarle el elemento o pasar una tarea
--      con elemento a reserva). Las tareas normales (kind = 'task') con event_id no cuentan ni se sincronizan.
--   2. Sincronización EN LOS DOS SENTIDOS entre plan_tasks.status de la reserva y events.reserved del elemento:
--        · Reserva hecha  → elemento reservado (la nota de reserva del evento no se toca).
--        · Reserva pendiente → elemento sin reservar y reservation_note = null (la misma regla de la app:
--          reservaAGuardar, «la nota solo cuenta si está reservado»).
--        · Elemento reservado → su reserva hecha (done_by = quien lo marca, por plan_tasks_before_write).
--        · Elemento sin reservar → su reserva pendiente.
--      Así «Marcar como reservado» del detalle del evento, el formulario del evento y la casilla de la tarea dicen
--      siempre lo mismo, se marque donde se marque. Sin bucles: cada lado solo escribe si el otro es distinto
--      (`where ... is distinct from`), así el rebote vuelve con 0 filas; los triggers son AFTER UPDATE OF la columna
--      con WHEN, y no tocan place_id/plan_id (no despiertan y_plan_collection).
--   3. Al ENLAZAR (crear la reserva con elemento, cambiarle el elemento o pasarla de tarea a reserva) gana «hecho»:
--      si el elemento ya estaba reservado, la reserva nace hecha; si la reserva ya estaba hecha, el elemento queda
--      reservado. Enlazar nunca desmarca nada. Desenlazar (event_id → null o a otro elemento), borrar la reserva o
--      pasarla a tarea normal no cambia el elemento: la reserva hecha sigue hecha y el elemento sigue reservado.
--      Borrar el elemento deja la reserva con event_id null (FK de siempre) y su estado.
--   Las dos funciones de sincronización son security invoker: escriben con la RLS de quien marca (los dos veis y
--   editáis las tareas y los elementos de un plan; un elemento de un plan nunca es secreto, CHECK de events). La
--   sincronización vale siempre (también en escrituras del servidor); las comprobaciones de enlace (TW060, TW064,
--   TW072), solo desde la app (private.is_client_write()), como las de F1.
--
-- Datos de producción (consultado en solo lectura el 2026-11-21): 0 planes, 0 tareas, 0 eventos (limpieza total).
-- plan_tasks_before_write y events_before_write de producción comparadas con pg_get_functiondef: idénticas a
-- 20261130000000_planificador_base.sql y 20261201000000_itinerario.sql. events_before_write NO cambia.
--
-- Contrato para la app:
--   · Enlazar: insert/update de plan_tasks con kind 'booking' y event_id (un elemento del itinerario de ESTE plan).
--       Leer la fila devuelta (.select()): si el elemento ya estaba reservado, vuelve con status 'done'.
--       Errores: TW060 el elemento no existe o es de otro plan (como en F1) · TW072 el elemento ya tiene otra reserva
--       enlazada (si dos personas enlazan a la vez la misma, la segunda recibe 23505: tratarlo como error genérico y
--       recargar). Un elemento elegible en el selector = del plan y sin reserva enlazada.
--   · Marcar / desmarcar: por cualquiera de los dos lados, con una sola escritura:
--       - casilla o botón «Reservar» de la tarea: update plan_tasks set status (como hoy, sin version);
--       - con nota de reserva (F9 «pide la nota»), si la reserva tiene elemento: update events set reserved = true,
--         reservation_note = <nota> con .eq('version') (la tarea pasa a hecha sola). Sin elemento: solo la tarea.
--       El otro lado cambia en la misma transacción y llega por Realtime (events y plan_tasks ya están en
--       supabase_realtime): invalidar las consultas de tareas y de eventos/itinerario/calendario al recibirlo.
--       Marcar la tarea sube la version del evento: un formulario de evento abierto con la version vieja guarda 0
--       filas y debe recargar («{pareja} lo ha cambiado»), como cualquier conflicto de version.
--   · El formulario del evento puede seguir mostrando «Reservado»: cambiarlo cambia la reserva enlazada.
--   · Errores raros: si los dos marcan a la vez la tarea y el evento en sentidos contrarios, Postgres corta una de
--       las dos con 40P01 (interbloqueo): mensaje genérico y recargar; el estado queda coherente.
--
-- Códigos: TW072 nuevo (no se usaba: TW070 y TW071 son del bote; comprobado con grep en supabase/, lib/, app/,
-- components/ y docs/). Funciones: plan_tasks_before_write parte de producción (= 20261130000000_planificador_base.sql)
-- y añade dos bloques marcados [Planificador F9]; plan_task_booking_to_event y event_reserved_to_bookings son nuevas.
-- Requiere 20261201000000_itinerario.sql.
-- Idempotente. La parte A (cambios) va en su transacción y la parte B (pruebas) acaba en ROLLBACK.
-- Funciona entero en el SQL Editor o con `supabase db query --remote -f`.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Requisitos y comprobaciones previas (si algo falla, no se cambia nada)
-- -----------------------------------------------------------------------------
do $$
declare
  v_n integer;
begin
  if to_regprocedure('public.move_plan(uuid, date, date, integer, boolean)') is null then
    raise exception 'Aplica antes 20261201000000_itinerario.sql';
  end if;
  if not exists (select 1 from pg_proc where oid = 'private.plan_tasks_before_write()'::regprocedure
                 and prosrc like '%[Planificador F1]%') then
    raise exception 'plan_tasks_before_write no es la de 20261130000000_planificador_base.sql: compárala antes';
  end if;

  select count(*) into v_n from (
    select event_id from public.plan_tasks
    where kind = 'booking' and event_id is not null
    group by event_id having count(*) > 1) d;
  if v_n > 0 then
    raise exception 'Hay % elementos con más de una reserva enlazada: deja una sola en cada uno antes', v_n;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Una reserva por elemento del itinerario (respaldo de TW072 para escrituras simultáneas)
-- -----------------------------------------------------------------------------
create unique index if not exists plan_tasks_una_reserva_por_evento on public.plan_tasks (event_id)
  where kind = 'booking' and event_id is not null;

-- -----------------------------------------------------------------------------
-- 2. plan_tasks_before_write: al enlazar gana «hecho» y TW072
--    Cuerpo idéntico al de producción (= 20261130000000_planificador_base.sql) salvo lo marcado [Planificador F9].
-- -----------------------------------------------------------------------------
create or replace function private.plan_tasks_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_reserved boolean;   -- [Planificador F9]
begin
  -- [Planificador F9] Al enlazar una reserva pendiente a un elemento ya reservado, la reserva nace hecha (antes del
  -- sello done_at/done_by de abajo). FOR NO KEY UPDATE: si la pareja está marcando o desmarcando el elemento a la
  -- vez, se espera y se lee lo que dejó (su trigger no veía aún esta reserva). No choca con el FOR KEY SHARE de la FK.
  if new.kind = 'booking' and new.event_id is not null and new.status = 'pending'
     and (tg_op = 'INSERT' or new.event_id is distinct from old.event_id or new.kind is distinct from old.kind) then
    select e.reserved into v_reserved from public.events e where e.id = new.event_id for no key update;
    if coalesce(v_reserved, false) then
      new.status := 'done';
    end if;
  end if;

  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.done_at := now();
    new.done_by := auth.uid();
  elsif new.status = 'pending' then
    new.done_at := null;
    new.done_by := null;
  end if;

  -- [Planificador F1] Una tarea no cambia de plan ni de pareja.
  if tg_op = 'UPDATE' then
    new.plan_id   := old.plan_id;
    new.couple_id := old.couple_id;
  end if;

  -- [Planificador F1] Enlaces que se ponen o cambian desde la app (los exists aplican la RLS de quien escribe).
  if private.is_client_write() then
    if new.place_id is not null and (tg_op = 'INSERT' or new.place_id is distinct from old.place_id)
       and not exists (select 1 from public.places p where p.id = new.place_id) then
      raise exception 'Sitio no encontrado' using errcode = 'TW064';
    end if;
    if new.event_id is not null and (tg_op = 'INSERT' or new.event_id is distinct from old.event_id)
       and not exists (select 1 from public.events e where e.id = new.event_id and e.plan_id = new.plan_id) then
      raise exception 'Evento no encontrado en este plan' using errcode = 'TW060';
    end if;
    if new.expense_id is not null and (tg_op = 'INSERT' or new.expense_id is distinct from old.expense_id)
       and not exists (select 1 from public.expenses x where x.id = new.expense_id and x.plan_id = new.plan_id) then
      raise exception 'Gasto no encontrado en este plan' using errcode = 'TW060';
    end if;
    -- [Planificador F9] Un elemento del itinerario tiene como mucho una reserva enlazada.
    if new.kind = 'booking' and new.event_id is not null
       and (tg_op = 'INSERT' or new.event_id is distinct from old.event_id or new.kind is distinct from old.kind)
       and exists (select 1 from public.plan_tasks t
                   where t.event_id = new.event_id and t.kind = 'booking' and t.id <> new.id) then
      raise exception 'Este elemento ya tiene una reserva' using errcode = 'TW072';
    end if;
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Reserva → elemento (after insert or update of status, event_id, kind en plan_tasks)
--    Mismo enlace y cambia el estado: el elemento queda igual que la reserva (sin reservar → nota null).
--    Enlace nuevo: solo si la reserva está hecha, el elemento queda reservado (enlazar nunca desmarca).
-- -----------------------------------------------------------------------------
create or replace function private.plan_task_booking_to_event() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.event_id is not distinct from old.event_id and new.kind = old.kind then
    if new.status is not distinct from old.status then
      return null;
    end if;
    update public.events e
       set reserved = (new.status = 'done'),
           reservation_note = case when new.status = 'done' then e.reservation_note end
     where e.id = new.event_id and e.reserved is distinct from (new.status = 'done');
  elsif new.status = 'done' then
    update public.events e set reserved = true where e.id = new.event_id and not e.reserved;
  end if;
  return null;
end $$;

drop trigger if exists y_booking_event on public.plan_tasks;
create trigger y_booking_event after insert or update of status, event_id, kind on public.plan_tasks
  for each row when (new.kind = 'booking' and new.event_id is not null)
  execute function private.plan_task_booking_to_event();

-- -----------------------------------------------------------------------------
-- 4. Elemento → reserva (after update of reserved en events, solo si cambia)
--    El rebote (plan_task_booking_to_event) encuentra el elemento ya igual y no escribe nada.
-- -----------------------------------------------------------------------------
create or replace function private.event_reserved_to_bookings() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.plan_tasks t
     set status = case when new.reserved then 'done' else 'pending' end::public.task_status
   where t.event_id = new.id and t.kind = 'booking'
     and t.status <> (case when new.reserved then 'done' else 'pending' end)::public.task_status;
  return null;
end $$;

drop trigger if exists y_booking_tasks on public.events;
create trigger y_booking_tasks after update of reserved on public.events
  for each row when (old.reserved is distinct from new.reserved)
  execute function private.event_reserved_to_bookings();

-- -----------------------------------------------------------------------------
-- 5. Relleno (en producción, nada el 2026-11-21): con la regla de enlazar, gana «hecho».
-- -----------------------------------------------------------------------------
update public.events e set reserved = true
where not e.reserved
  and exists (select 1 from public.plan_tasks t where t.event_id = e.id and t.kind = 'booking' and t.status = 'done');
update public.plan_tasks t set status = 'done'
where t.kind = 'booking' and t.status = 'pending'
  and exists (select 1 from public.events e where e.id = t.event_id and e.reserved);

-- -----------------------------------------------------------------------------
-- 6. Permisos explícitos: las funciones de trigger no se conceden a nadie (los triggers no comprueban EXECUTE)
-- -----------------------------------------------------------------------------
revoke all on function private.plan_tasks_before_write()     from public, anon, authenticated;
revoke all on function private.plan_task_booking_to_event()  from public, anon, authenticated;
revoke all on function private.event_reserved_to_bookings()  from public, anon, authenticated;

commit;

-- =============================================================================
-- PARTE B · Pruebas (no dejan nada: todo acaba en ROLLBACK). Ejecutar como postgres.
-- Si una prueba falla, el script se detiene con «FALLO: ...» y la parte A ya está aplicada.
-- Escrituras «de la app» con set local role authenticated y auth.uid() simulado con request.jwt.claims
-- (se aplican la RLS y los triggers); las comprobaciones, como postgres.
-- No cambia la estructura de ninguna tabla ni toca filas reales: solo una pareja y tres usuarios de prueba.
--   Ana (…0000000000f5, m1), Beto (…0000000000f6, m2) y Ciro (…0000000000f7, sin pareja).
-- =============================================================================
begin;
set local idle_in_transaction_session_timeout = '60s';

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000f5', 'resv-a@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f6', 'resv-b@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f7', 'resv-c@prueba.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-0000000000f5', 'Ana'),
  ('00000000-0000-4000-8000-0000000000f6', 'Beto'),
  ('00000000-0000-4000-8000-0000000000f7', 'Ciro')
on conflict (id) do update set display_name = excluded.display_name;
insert into public.couples (id) values ('00000000-0000-4000-8000-0000000000fd');
insert into public.couple_settings (couple_id) values ('00000000-0000-4000-8000-0000000000fd') on conflict do nothing;
insert into public.couple_members (couple_id, user_id, slot) values
  ('00000000-0000-4000-8000-0000000000fd', '00000000-0000-4000-8000-0000000000f5', 'm1'),
  ('00000000-0000-4000-8000-0000000000fd', '00000000-0000-4000-8000-0000000000f6', 'm2');

-- Datos de prueba (Ana): planes P1 «Lisboa» (1–4 jun 2030) y P2 «Oporto» (1–3 jul); elementos de P1: E1 «Cena»,
-- E2 «Hotel», E3 «Museo» (sin reservar pero con una nota vieja), E4 «Fado» (ya reservado con nota), E5 «Tranvía»;
-- E9 elemento de P2.
do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000fd';
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f5","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.plans (id, couple_id, type, name, icon, start_date, end_date) values
    ('00000000-0000-4000-8000-0000000e0001', v_c, 'trip', 'Lisboa', '✈️', '2030-06-01', '2030-06-04'),
    ('00000000-0000-4000-8000-0000000e0002', v_c, 'trip', 'Oporto', '🍷', '2030-07-01', '2030-07-03');
  insert into public.events (id, couple_id, title, start_date, start_time, plan_id, category) values
    ('00000000-0000-4000-8000-0000000e0101', v_c, 'Cena', '2030-06-01', '21:30', '00000000-0000-4000-8000-0000000e0001', 'eating_out'),
    ('00000000-0000-4000-8000-0000000e0102', v_c, 'Hotel', '2030-06-01', null, '00000000-0000-4000-8000-0000000e0001', 'trip'),
    ('00000000-0000-4000-8000-0000000e0105', v_c, 'Tranvía', '2030-06-03', '10:00', '00000000-0000-4000-8000-0000000e0001', 'leisure'),
    ('00000000-0000-4000-8000-0000000e0109', v_c, 'Bodega', '2030-07-02', '12:00', '00000000-0000-4000-8000-0000000e0002', 'leisure');
  insert into public.events (id, couple_id, title, start_date, plan_id, reserved, reservation_note) values
    ('00000000-0000-4000-8000-0000000e0103', v_c, 'Museo', '2030-06-02', '00000000-0000-4000-8000-0000000e0001', false, 'Nota vieja'),
    ('00000000-0000-4000-8000-0000000e0104', v_c, 'Fado', '2030-06-02', '00000000-0000-4000-8000-0000000e0001', true, 'A nombre de Ana');
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B1. Estructura y permisos
do $$
begin
  assert exists (select 1 from pg_indexes where schemaname = 'public' and tablename = 'plan_tasks'
                 and indexname = 'plan_tasks_una_reserva_por_evento' and indexdef like '%UNIQUE%'),
         'FALLO: falta el índice único plan_tasks_una_reserva_por_evento';
  assert (select prosrc like '%[Planificador F1]%' and prosrc like '%[Planificador F9]%' and not prosecdef
                 and proconfig @> array['search_path=""']
          from pg_proc where oid = 'private.plan_tasks_before_write()'::regprocedure),
         'FALLO: plan_tasks_before_write no parte de la de F1, no lleva F9 o es security definer';
  assert (select bool_and(not prosecdef and proconfig @> array['search_path=""']) from pg_proc
          where oid in ('private.plan_task_booking_to_event()'::regprocedure, 'private.event_reserved_to_bookings()'::regprocedure)),
         'FALLO: las funciones de sincronización deben ser security invoker con search_path vacío';
  assert not has_function_privilege('authenticated', 'private.plan_task_booking_to_event()', 'execute')
     and not has_function_privilege('authenticated', 'private.event_reserved_to_bookings()', 'execute')
     and not has_function_privilege('authenticated', 'private.plan_tasks_before_write()', 'execute'),
         'FALLO: authenticated ejecuta funciones de trigger';
  assert exists (select 1 from pg_trigger where not tgisinternal and tgname = 'y_booking_event'
                 and tgrelid = 'public.plan_tasks'::regclass and tgfoid = 'private.plan_task_booking_to_event()'::regprocedure)
     and exists (select 1 from pg_trigger where not tgisinternal and tgname = 'y_booking_tasks'
                 and tgrelid = 'public.events'::regclass and tgfoid = 'private.event_reserved_to_bookings()'::regprocedure),
         'FALLO: faltan los triggers y_booking_event / y_booking_tasks';
  assert (select prosrc like '%[Planificador F6]%' from pg_proc where oid = 'private.events_before_write()'::regprocedure),
         'FALLO: events_before_write ya no es la de F6';
end $$;

-- B2. Reserva → elemento: hecha reserva el elemento (nota intacta); pendiente lo desmarca (nota null); una sola
--     escritura en cada lado (sin bucles); la pareja también; una reserva sin elemento no toca nada
do $$
declare
  v_c   constant uuid := '00000000-0000-4000-8000-0000000000fd';
  v_ana constant uuid := '00000000-0000-4000-8000-0000000000f5';
  v_bet constant uuid := '00000000-0000-4000-8000-0000000000f6';
  v_p1  constant uuid := '00000000-0000-4000-8000-0000000e0001';
  v_e1  constant uuid := '00000000-0000-4000-8000-0000000e0101';
  v_e3  constant uuid := '00000000-0000-4000-8000-0000000e0103';
  v_t1  constant uuid := '00000000-0000-4000-8000-0000000e0401';
  v_t3  constant uuid := '00000000-0000-4000-8000-0000000e0403';
  v_t8  constant uuid := '00000000-0000-4000-8000-0000000e0408';
  v_ev  integer;
  v_tv  integer;
  v_n   integer;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f5","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.plan_tasks (id, couple_id, plan_id, kind, title, event_id) values
    (v_t1, v_c, v_p1, 'booking', 'Reservar cena', v_e1),
    (v_t3, v_c, v_p1, 'booking', 'Entradas museo', v_e3);
  insert into public.plan_tasks (id, couple_id, plan_id, kind, title) values (v_t8, v_c, v_p1, 'booking', 'Seguro');
  reset role;
  assert (select status = 'pending' from public.plan_tasks where id = v_t1)
     and (select not reserved and version = 1 from public.events where id = v_e1),
         'FALLO: enlazar una reserva pendiente cambió el elemento o la reserva';
  select count(*) into v_n from public.events where couple_id = v_c and reserved;
  select version into v_ev from public.events where id = v_e1;
  select version into v_tv from public.plan_tasks where id = v_t1;

  -- Beto marca hecha la reserva de la cena
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f6","role":"authenticated"}', true);
  set local role authenticated;
  update public.plan_tasks set status = 'done' where id = v_t1;
  reset role;
  assert (select reserved and reservation_note is null and version = v_ev + 1 from public.events where id = v_e1),
         'FALLO: marcar hecha la reserva no reservó el elemento (o lo escribió más de una vez)';
  assert (select status = 'done' and done_by = v_bet and version = v_tv + 1 from public.plan_tasks where id = v_t1),
         'FALLO: la reserva no quedó hecha por Beto (o el rebote la volvió a escribir)';

  -- Ana pone la nota en el evento (como el formulario: reserved sigue true) → la tarea no cambia
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f5","role":"authenticated"}', true);
  set local role authenticated;
  update public.events set reserved = true, reservation_note = 'A nombre de Ana, 21:30' where id = v_e1;
  -- Hecha la del museo: el elemento tenía una nota vieja sin reservar; se reserva y la nota no se toca
  update public.plan_tasks set status = 'done' where id = v_t3;
  -- Reserva sin elemento: hecha y pendiente no tocan ningún evento
  update public.plan_tasks set status = 'done' where id = v_t8;
  update public.plan_tasks set status = 'pending' where id = v_t8;
  -- Mandar el mismo estado otra vez (la hoja de la tarea manda la fila entera) no hace nada en el evento
  update public.plan_tasks set status = 'done', title = 'Reservar cena en Alfama' where id = v_t1;
  reset role;
  assert (select status = 'done' and done_by = v_bet from public.plan_tasks where id = v_t1),
         'FALLO: guardar la nota del evento o editar la tarea cambió quién la hizo';
  assert (select reserved and reservation_note = 'A nombre de Ana, 21:30' and version = v_ev + 2 from public.events where id = v_e1),
         'FALLO: editar la tarea sin cambiar su estado tocó el elemento';
  assert (select reserved and reservation_note = 'Nota vieja' from public.events where id = v_e3),
         'FALLO: marcar hecha la reserva cambió la nota del elemento';
  assert (select count(*) = v_n + 2 from public.events where couple_id = v_c and reserved),
         'FALLO: una reserva sin elemento reservó algún evento';

  -- Beto vuelve a pendiente la de la cena → el elemento sin reservar y sin nota
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f6","role":"authenticated"}', true);
  set local role authenticated;
  update public.plan_tasks set status = 'pending' where id = v_t1;
  reset role;
  assert (select not reserved and reservation_note is null and version = v_ev + 3 from public.events where id = v_e1),
         'FALLO: volver a pendiente la reserva no desmarcó el elemento (o no borró la nota)';
  assert (select status = 'pending' and done_at is null and done_by is null from public.plan_tasks where id = v_t1),
         'FALLO: la reserva no quedó pendiente';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B3. Elemento → reserva: reservar el elemento (botón del detalle o formulario) hace la reserva y la quita;
--     un formulario con la version vieja ya no guarda (0 filas)
do $$
declare
  v_ana constant uuid := '00000000-0000-4000-8000-0000000000f5';
  v_e1  constant uuid := '00000000-0000-4000-8000-0000000e0101';
  v_t1  constant uuid := '00000000-0000-4000-8000-0000000e0401';
  v_ev  integer;
  v_tv  integer;
  v_n   integer;
begin
  select version into v_ev from public.events where id = v_e1;
  select version into v_tv from public.plan_tasks where id = v_t1;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f5","role":"authenticated"}', true);
  set local role authenticated;
  update public.events set reserved = true, reservation_note = 'Mesa 4' where id = v_e1 and version = v_ev;
  reset role;
  assert (select status = 'done' and done_by = v_ana and done_at is not null and version = v_tv + 1
          from public.plan_tasks where id = v_t1),
         'FALLO: reservar el elemento no hizo la reserva (hecha por Ana, una sola vez)';
  assert (select reserved and reservation_note = 'Mesa 4' and version = v_ev + 1 from public.events where id = v_e1),
         'FALLO: el rebote volvió a escribir el elemento';

  -- Beto la desmarca desde la tarea; el formulario de Ana con la version anterior guarda 0 filas
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f6","role":"authenticated"}', true);
  set local role authenticated;
  update public.plan_tasks set status = 'pending' where id = v_t1;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f5","role":"authenticated"}', true);
  update public.events set title = 'Cena en Alfama', reserved = true, reservation_note = 'Mesa 4'
  where id = v_e1 and version = v_ev + 1;
  get diagnostics v_n = row_count;
  -- Ana lo quita desde el elemento (como el formulario: reserved false, nota null) cuando vuelve a estar hecha
  update public.plan_tasks set status = 'done' where id = v_t1;
  update public.events set reserved = false, reservation_note = null where id = v_e1;
  reset role;
  assert v_n = 0, 'FALLO: un formulario con la version vieja pisó el cambio de la reserva';
  assert (select status = 'pending' and done_by is null from public.plan_tasks where id = v_t1)
     and (select not reserved and title = 'Cena' from public.events where id = v_e1),
         'FALLO: desmarcar el elemento no volvió a pendiente la reserva';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B4. Enlazar, desenlazar y reglas del enlace
do $$
declare
  v_c   constant uuid := '00000000-0000-4000-8000-0000000000fd';
  v_ana constant uuid := '00000000-0000-4000-8000-0000000000f5';
  v_p1  constant uuid := '00000000-0000-4000-8000-0000000e0001';
  v_p2  constant uuid := '00000000-0000-4000-8000-0000000e0002';
  v_e1  constant uuid := '00000000-0000-4000-8000-0000000e0101';
  v_e2  constant uuid := '00000000-0000-4000-8000-0000000e0102';
  v_e4  constant uuid := '00000000-0000-4000-8000-0000000e0104';
  v_e5  constant uuid := '00000000-0000-4000-8000-0000000e0105';
  v_e9  constant uuid := '00000000-0000-4000-8000-0000000e0109';
  v_t2  constant uuid := '00000000-0000-4000-8000-0000000e0402';
  v_t4  constant uuid := '00000000-0000-4000-8000-0000000e0404';
  v_t5  constant uuid := '00000000-0000-4000-8000-0000000e0405';
  v_t6  constant uuid := '00000000-0000-4000-8000-0000000e0406';
  v_t9  constant uuid := '00000000-0000-4000-8000-0000000e0409';
  v_ok  boolean;
  v_v   integer;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f5","role":"authenticated"}', true);
  set local role authenticated;
  -- Una reserva ya hecha enlazada a un elemento sin reservar → el elemento queda reservado
  insert into public.plan_tasks (id, couple_id, plan_id, kind, title, status, event_id)
  values (v_t2, v_c, v_p1, 'booking', 'Hotel', 'done', v_e2);
  -- Una reserva pendiente enlazada a un elemento ya reservado (Fado) → nace hecha, por Ana; la nota sigue
  insert into public.plan_tasks (id, couple_id, plan_id, kind, title, event_id)
  values (v_t4, v_c, v_p1, 'booking', 'Fado', v_e4);
  -- Otra reserva al mismo elemento → TW072 (al crearla y al cambiarle el elemento)
  v_ok := false;
  begin
    insert into public.plan_tasks (couple_id, plan_id, kind, title, event_id) values (v_c, v_p1, 'booking', 'Fado otra vez', v_e4);
  exception when sqlstate 'TW072' then v_ok := true;
  end;
  assert v_ok, 'FALLO: una segunda reserva para el mismo elemento no da TW072';
  v_ok := false;
  begin
    update public.plan_tasks set event_id = v_e4 where id = v_t2;
  exception when sqlstate 'TW072' then v_ok := true;
  end;
  assert v_ok, 'FALLO: cambiar una reserva a un elemento que ya tiene otra no da TW072';
  -- Un elemento de otro plan → TW060 (F1, antes que TW072)
  v_ok := false;
  begin
    insert into public.plan_tasks (couple_id, plan_id, kind, title, event_id) values (v_c, v_p1, 'booking', 'Bodega', v_e9);
  exception when sqlstate 'TW060' then v_ok := true;
  end;
  assert v_ok, 'FALLO: enlazar un elemento de otro plan no da TW060';
  -- Una tarea normal con el mismo elemento sí se puede y no sincroniza nada
  insert into public.plan_tasks (id, couple_id, plan_id, kind, title, event_id)
  values (v_t5, v_c, v_p1, 'task', 'Llevar chaqueta', v_e4);
  update public.plan_tasks set status = 'done' where id = v_t5;
  update public.plan_tasks set status = 'pending' where id = v_t5;
  -- Pasar a reserva una tarea con elemento ya reservado → TW072 (Fado ya tiene la suya)
  v_ok := false;
  begin
    update public.plan_tasks set kind = 'booking' where id = v_t5;
  exception when sqlstate 'TW072' then v_ok := true;
  end;
  assert v_ok, 'FALLO: pasar a reserva una tarea de un elemento que ya tiene reserva no da TW072';
  -- Tarea normal con Tranvía, que pasa a reserva cuando Tranvía ya está reservado → hecha
  insert into public.plan_tasks (id, couple_id, plan_id, kind, title, event_id)
  values (v_t6, v_c, v_p1, 'task', 'Billetes tranvía', v_e5);
  update public.events set reserved = true where id = v_e5;
  update public.plan_tasks set kind = 'booking' where id = v_t6;
  reset role;

  assert (select reserved from public.events where id = v_e2), 'FALLO: enlazar una reserva hecha no reservó el elemento';
  assert (select status = 'done' and done_by = v_ana from public.plan_tasks where id = v_t4)
     and (select reserved and reservation_note = 'A nombre de Ana' from public.events where id = v_e4),
         'FALLO: enlazar a un elemento reservado no hizo la reserva (o cambió el elemento)';
  assert (select status = 'pending' from public.plan_tasks where id = v_t5),
         'FALLO: una tarea normal se sincronizó con el elemento';
  assert (select status = 'done' and kind = 'booking' from public.plan_tasks where id = v_t6),
         'FALLO: pasar a reserva una tarea de un elemento reservado no la hizo';

  -- Desenlazar o cambiar de elemento no desmarca nada; borrar la reserva tampoco; borrar el elemento deja la reserva
  select version into v_v from public.events where id = v_e2;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f6","role":"authenticated"}', true);
  set local role authenticated;
  update public.plan_tasks set event_id = null where id = v_t2;
  update public.plan_tasks set status = 'pending' where id = v_t2;   -- ya sin elemento: no lo toca
  delete from public.plan_tasks where id = v_t6;
  reset role;
  assert (select reserved and version = v_v from public.events where id = v_e2),
         'FALLO: desenlazar la reserva o cambiarla después tocó el elemento';
  assert (select reserved from public.events where id = v_e5), 'FALLO: borrar la reserva desmarcó el elemento';
  delete from public.events where id = v_e4;
  assert (select event_id is null and status = 'done' from public.plan_tasks where id = v_t4)
     and (select event_id is null from public.plan_tasks where id = v_t5),
         'FALLO: borrar el elemento cambió el estado de la reserva o no la desenlazó';

  -- Ciro (sin pareja) no ve ni marca nada
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f7","role":"authenticated"}', true);
  set local role authenticated;
  update public.plan_tasks set status = 'done' where id = '00000000-0000-4000-8000-0000000e0401';
  update public.events set reserved = true where id = v_e1;
  reset role;
  assert (select status = 'pending' from public.plan_tasks where id = '00000000-0000-4000-8000-0000000e0401')
     and (select not reserved from public.events where id = v_e1),
         'FALLO: alguien sin pareja cambió una reserva o un elemento';

  -- La sincronización también vale en escrituras del servidor (postgres, sin RLS)
  perform set_config('request.jwt.claims', '{}', true);
  update public.plan_tasks set status = 'done' where id = '00000000-0000-4000-8000-0000000e0401';
  assert (select reserved from public.events where id = v_e1), 'FALLO: una escritura del servidor no sincronizó';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B5. Final
do $$
begin
  raise notice 'PRUEBAS DE RESERVAS DEL PLAN (F9): todas correctas';
end $$;

rollback;
