-- =============================================================================
-- ito · Planificador, fase F6: itinerario por días (docs/plan-planificador.md §3 M2 y §F6; docs/modelo-datos.md §3)
--
-- El itinerario de un plan son sus eventos con plan_id (no salen en el calendario global: calendar_range ya los
-- excluye). Qué añade:
--   1. Un elemento del itinerario no se repite: CHECK events_plan_sin_repetir (plan_id is null or recurrence = 'none').
--   2. Un elemento del itinerario cae dentro de las fechas de su plan (TW067), en events_before_write. Solo se
--      comprueba desde la app y al crearlo o al cambiarle start_date o end_date: editar el título, la hora,
--      la franja, el orden o el sitio de un elemento que ya está fuera (porque se movió el plan sin su itinerario)
--      sigue funcionando, y «Mover» a un día del plan también. Moverlo a otro día fuera del plan, no.
--      Los eventos sueltos (sin plan_id) no cambian en nada.
--      plan_id solo se fija al crear (TW069, desde la app): un evento no entra en un plan, no sale ni pasa a otro.
--      Así borrar sin aprobación (punto 5) no sirve para borrar un evento suelto compartido metiéndolo antes en un plan.
--   3. Mover el plan de fechas: RPC public.move_plan. Cambia start_date/end_date del plan con control de versión y,
--      si p_shift, desplaza TODOS sus elementos (también los que ya estaban fuera) el mismo número de días que el
--      inicio, en la misma transacción. La hora local se conserva: events_before_write recalcula starts_at/ends_at
--      en la zona del evento (cambio de hora incluido); los de todo el día siguen de todo el día; end_date null sigue
--      null. Si el plan se acorta, los elementos que caen después del nuevo fin se mueven igual y quedan «Fuera de
--      las fechas del plan» (la app los enseña ahí con «Mover»; la RPC dice cuántos). Los gastos no se mueven.
--      security definer (como request_deletion): comprueba ella misma que el plan es de tu pareja, y así el TW067 del
--      punto 2 no impide acortar un plan con elementos al final. El plan sigue pasando sus CHECK (60 días como mucho,
--      fin >= inicio).
--   4. Los sitios del itinerario y de las tareas entran en la colección del plan (trigger y_plan_collection en events
--      y plan_tasks; invoker: la RLS de collection_places decide; added_by = quien escribe). Solo al poner o cambiar
--      el sitio (o el plan del evento): editar otra cosa no vuelve a meter un sitio que alguien quitó a mano de la
--      colección. Un sitio que quien escribe no ve (el privado de la pareja en un evento que era suyo) no se añade
--      y no da error. Quitar el sitio de un elemento, borrar el elemento o mover el plan NUNCA lo saca de la
--      colección: la colección es la lista de sitios del plan (pestaña Sitios, resumen F10) y también tiene sitios
--      añadidos a mano que no se distinguen de los del itinerario; sacarlos solos borraría trabajo de la pareja.
--      Quitar un sitio de la colección sigue siendo directo (sin aprobación).
--      Relleno: los elementos y tareas que ya tenían sitio lo meten ahora (added_by = quien creó el elemento).
--   5. Borrar un elemento del itinerario no pide aprobación (decisión 2): request_deletion, rama 'event',
--      v_free := e.is_secret or e.plan_id is not null. Los eventos sueltos compartidos siguen pidiendo aprobación,
--      los secretos se siguen borrando al momento y el plan entero sigue pidiendo aprobación. El gasto de un elemento
--      borrado se queda en el plan (conserva plan_id) con el título del evento en event_title_snapshot.
--
-- Datos de producción (consultado en solo lectura el 2026-11-21): 1 plan (con su colección), 0 eventos con plan_id
-- (0 repetidos, 0 fuera de fechas), 0 gastos con plan_id, 2 tareas (0 con sitio). move_plan no existía.
-- events_before_write, request_deletion y execute_deletion de producción comparadas con pg_get_functiondef:
-- idénticas a 20261126000000_mapa.sql, 20261128000000_colecciones_borrado.sql y 20261113000000_esquema_inicial.sql.
--
-- Contrato para la app:
--   · Mover el plan de fechas (pantalla editar, tras «¿Mover también el itinerario (N elementos)?»):
--       rpc('move_plan', {p_plan_id, p_start: 'YYYY-MM-DD', p_end: 'YYYY-MM-DD', p_version: <version leída>,
--                         p_shift: true | false})
--       → {version: <nueva version del plan>, moved: <elementos movidos>, outside: <elementos fuera de las fechas
--          nuevas>}. Con p_shift false, moved = 0 y outside dice cuántos se han quedado fuera.
--       Errores: TW001 sin pareja · TW060 el plan no existe o no es vuestro · TW068 la pareja lo ha cambiado
--       (version distinta: recargar y avisar) · 23514 fin antes del inicio o más de 60 días.
--       Las fechas SOLO por move_plan cuando cambian (el resto de campos, con el update de siempre y .eq('version');
--       si cambian las dos cosas: primero el update, que devuelve la version nueva, y después move_plan con ella).
--       Un update directo de start_date/end_date sigue permitido y equivale a p_shift false.
--   · Elementos del itinerario (insert/update en events con plan_id): TW067 fecha fuera de las fechas del plan
--       (al crearlo o al cambiarle el día) · TW069 se cambia plan_id de un evento ya creado (mandar el mismo plan_id
--       no da error) · 23514 si se manda recurrence distinta de 'none' (el
--       formulario en modo plan no ofrece repetir) · TW064 sitio que no ves (como siempre).
--   · Borrar un elemento del itinerario: rpc('request_deletion', {p_id, p_type: 'event', p_target_id})
--       → {status: 'deleted'} siempre (sin aprobación). Un evento suelto compartido sigue → {status: 'pending', …}.
--   · Colección del plan: al guardar un elemento o tarea con sitio, el sitio aparece en la colección (Realtime de
--       collection_places). La app no tiene que insertarlo; si lo hace, on conflict do nothing.
--
-- Códigos: TW067, TW068 y TW069 nuevos (no se usaban: comprobado con grep en supabase/, lib/, app/, components/ y docs/).
-- Funciones: events_before_write parte de producción (= 20261126000000_mapa.sql) y añade el bloque
-- [Planificador F6]; request_deletion parte de producción (= 20261128000000_colecciones_borrado.sql) y cambia una
-- línea marcada [Planificador F6]. execute_deletion no cambia. move_plan y plan_place_to_collection son nuevas.
-- Requiere 20261130000000_planificador_base.sql.
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
  if to_regprocedure('private.plans_before_write()') is null then
    raise exception 'Aplica antes 20261130000000_planificador_base.sql';
  end if;
  if not exists (select 1 from pg_proc where oid = 'private.events_before_write()'::regprocedure
                 and prosrc like '%[Mapa F1]%') then
    raise exception 'events_before_write no es la de 20261126000000_mapa.sql: compárala antes';
  end if;
  if not exists (select 1 from pg_proc
                 where oid = 'public.request_deletion(uuid, public.deletion_target, uuid, date)'::regprocedure
                   and prosrc like '%[Colecciones]%') then
    raise exception 'request_deletion no es la de 20261128000000_colecciones_borrado.sql: compárala antes';
  end if;

  select count(*) into v_n from public.events where plan_id is not null and recurrence <> 'none';
  if v_n > 0 then
    raise exception 'Hay % elementos de itinerario que se repiten: quítales la repetición antes', v_n;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. El itinerario no se repite
-- -----------------------------------------------------------------------------
alter table public.events drop constraint if exists events_plan_sin_repetir;
alter table public.events add constraint events_plan_sin_repetir check (plan_id is null or recurrence = 'none');

-- -----------------------------------------------------------------------------
-- 2. Un elemento del itinerario cae dentro de las fechas de su plan (TW067) y no cambia de plan (TW069)
--    Cuerpo idéntico al de producción (= 20261126000000_mapa.sql) salvo lo marcado [Planificador F6].
-- -----------------------------------------------------------------------------
create or replace function private.events_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_plan_start date;   -- [Planificador F6]
  v_plan_end   date;   -- [Planificador F6]
begin
  if tg_op = 'INSERT' then
    new.time_zone := coalesce((select c.time_zone from public.couples c where c.id = new.couple_id), 'Europe/Madrid');
  else
    new.time_zone := old.time_zone;
  end if;

  new.starts_at := (new.start_date + coalesce(new.start_time, time '00:00')) at time zone new.time_zone;
  new.ends_at := case
    when new.end_time is not null
      then (coalesce(new.end_date, new.start_date) + new.end_time) at time zone new.time_zone
    when new.start_time is not null and new.end_date is null
      then new.starts_at + interval '90 minutes'          -- cena a las 21:30 → pregunta a las 23:00
    else (coalesce(new.end_date, new.start_date) + 1)::timestamp at time zone new.time_zone
  end;
  if new.ends_at < new.starts_at then
    raise exception 'El evento termina antes de empezar' using errcode = 'TW050';
  end if;
  -- Un evento compartido no se puede volver secreto: la pareja ya lo tiene en su caché y
  -- Realtime no le avisaría (la fila deja de pasar su RLS). Revelarlo sí se puede.
  if tg_op = 'UPDATE' and new.is_secret and not old.is_secret then
    raise exception 'Un evento compartido no se puede volver secreto' using errcode = 'TW051';
  end if;

  -- [Mapa F1] Solo se puede enlazar un sitio que quien escribe puede ver (no el sitio privado de la pareja).
  if private.is_client_write() and new.place_id is not null
     and (tg_op = 'INSERT' or new.place_id is distinct from old.place_id)
     and not exists (select 1 from public.places p where p.id = new.place_id) then
    raise exception 'Sitio no encontrado' using errcode = 'TW064';
  end if;

  -- [Planificador F6] plan_id solo se fija al crear: desde la app un evento no entra en un plan, no sale ni pasa a
  -- otro (si no, meter un evento suelto compartido en un plan permitiría borrarlo sin aprobación).
  if private.is_client_write() and tg_op = 'UPDATE' and new.plan_id is distinct from old.plan_id then
    raise exception 'Un evento no cambia de plan' using errcode = 'TW069';
  end if;

  -- [Planificador F6] Un elemento del itinerario cae dentro de las fechas de su plan, al crearlo o al cambiarle el
  -- día. Solo desde la app: move_plan (servidor) deja fuera los que caen después del nuevo fin al acortar
  -- el plan, y editar otra cosa de un elemento que ya está fuera sigue funcionando. FOR KEY SHARE: si move_plan
  -- está cambiando el plan a la vez, se espera y se comprueba con las fechas nuevas. Si el plan no existe o no es
  -- de la pareja, no se encuentra y lo rechaza la FK (23503).
  if private.is_client_write() and new.plan_id is not null
     and (tg_op = 'INSERT'
          or new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date) then
    select p.start_date, p.end_date into v_plan_start, v_plan_end
    from public.plans p where p.id = new.plan_id
    for key share;
    if found and (new.start_date < v_plan_start or coalesce(new.end_date, new.start_date) > v_plan_end) then
      raise exception 'Fuera de las fechas del plan' using errcode = 'TW067';
    end if;
  end if;
  return new;
end $$;


-- -----------------------------------------------------------------------------
-- 3. Mover el plan de fechas y, si se pide, todo su itinerario
--    security definer: comprueba ella misma la pareja (lo mismo que la RLS de plans: los dos veis y editáis todos
--    los planes; un evento de un plan nunca es secreto, CHECK de events). Dentro, is_client_write() es false: el
--    TW067 de events_before_write no salta y un plan acortado puede dejar elementos fuera (se cuentan en outside).
-- -----------------------------------------------------------------------------
create or replace function public.move_plan(p_plan_id uuid, p_start date, p_end date, p_version integer,
                                            p_shift boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_couple  uuid := private.my_couple_id();
  v_old     public.plans;
  v_version integer;
  v_delta   integer;
  v_moved   integer := 0;
  v_outside integer;
begin
  if v_couple is null then
    raise exception 'No perteneces a ninguna pareja' using errcode = 'TW001';
  end if;

  -- Bloquea el plan mientras se mueve: nadie lo edita ni le añade o cambia de día elementos (events_before_write
  -- pide FOR KEY SHARE sobre el plan y espera; después comprueba con las fechas nuevas).
  select * into v_old from public.plans p
  where p.id = p_plan_id and p.couple_id = v_couple
  for update;
  if not found then
    raise exception 'Plan no encontrado' using errcode = 'TW060';
  end if;
  if p_version is null or v_old.version <> p_version then
    raise exception 'Tu pareja ha cambiado el plan mientras tanto' using errcode = 'TW068';
  end if;

  -- Los CHECK de plans (fin >= inicio, 60 días como mucho) dan 23514; z_touch sube la versión.
  update public.plans set start_date = p_start, end_date = p_end where id = p_plan_id
  returning version into v_version;

  -- Todo el itinerario, el mismo número de días que el inicio. Solo cambian las fechas: la hora local, la franja y
  -- «todo el día» se conservan, y events_before_write recalcula starts_at/ends_at en la zona de cada evento.
  v_delta := p_start - v_old.start_date;
  if coalesce(p_shift, false) and v_delta <> 0 then
    update public.events set start_date = start_date + v_delta, end_date = end_date + v_delta
    where plan_id = p_plan_id;
    get diagnostics v_moved = row_count;
  end if;

  select count(*) into v_outside from public.events e
  where e.plan_id = p_plan_id and (e.start_date < p_start or coalesce(e.end_date, e.start_date) > p_end);

  return jsonb_build_object('version', v_version, 'moved', v_moved, 'outside', v_outside);
end $$;

-- -----------------------------------------------------------------------------
-- 4. Los sitios del itinerario y de las tareas entran en la colección del plan
--    Invoker: la RLS de collection_places decide (sitio y colección que ves, added_by = quien escribe). El join con
--    places (que también pasa por la RLS) hace que un sitio que no ves no se añada, sin error. Solo al poner o
--    cambiar el sitio, o el plan del evento: no se vuelve a meter un sitio que alguien quitó a mano. Nunca saca nada.
-- -----------------------------------------------------------------------------
create or replace function private.plan_place_to_collection() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.place_id is not distinct from old.place_id
     and new.plan_id is not distinct from old.plan_id then
    return null;
  end if;
  insert into public.collection_places (collection_id, place_id, couple_id)
  select c.id, p.id, new.couple_id
  from public.collections c
  join public.places p on p.id = new.place_id
  where c.plan_id = new.plan_id
  on conflict do nothing;
  return null;
end $$;

drop trigger if exists y_plan_collection on public.events;
create trigger y_plan_collection after insert or update of place_id, plan_id on public.events
  for each row when (new.plan_id is not null and new.place_id is not null)
  execute function private.plan_place_to_collection();

drop trigger if exists y_plan_collection on public.plan_tasks;
create trigger y_plan_collection after insert or update of place_id on public.plan_tasks
  for each row when (new.place_id is not null)
  execute function private.plan_place_to_collection();

-- Relleno: lo que ya tenía sitio (en producción, nada el 2026-11-21). added_by = quien creó el elemento más antiguo.
insert into public.collection_places (collection_id, place_id, couple_id, added_by)
select distinct on (c.id, x.place_id) c.id, x.place_id, x.couple_id, x.created_by
from (select e.couple_id, e.plan_id, e.place_id, e.created_by, e.created_at
      from public.events e where e.plan_id is not null and e.place_id is not null
      union all
      select t.couple_id, t.plan_id, t.place_id, t.created_by, t.created_at
      from public.plan_tasks t where t.place_id is not null) x
join public.collections c on c.plan_id = x.plan_id
order by c.id, x.place_id, x.created_at
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- 5. Borrar un elemento del itinerario sin aprobación
--    Idéntica a la de producción (pg_get_functiondef, 2026-11-21, = 20261128000000_colecciones_borrado.sql §4) salvo
--    la línea marcada [Planificador F6]. execute_deletion no cambia (borra el evento; sus gastos se quedan con plan_id
--    y event_title_snapshot, y la tarea enlazada pierde event_id).
-- -----------------------------------------------------------------------------
create or replace function public.request_deletion(p_id uuid, p_type public.deletion_target, p_target_id uuid,
                                        p_occurrence_date date default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := auth.uid();
  v_couple    uuid := private.my_couple_id();
  v_found     boolean := false;
  v_label     text;
  v_free      boolean := false;   -- no necesita aprobación
  v_settled   boolean := false;
  v_plan_coll boolean := false;
  v_mode      text;               -- [Colecciones] 'plan' | 'delete' | 'approval' | 'leave'
  v_req       public.deletion_requests;
begin
  if v_couple is null then
    raise exception 'No perteneces a ninguna pareja' using errcode = 'TW001';
  end if;

  select * into v_req from public.deletion_requests d where d.id = p_id;
  if found then
    if v_req.couple_id <> v_couple then
      raise exception 'Solicitud no válida' using errcode = 'TW060';
    end if;
    return jsonb_build_object('status', v_req.status, 'request_id', v_req.id);
  end if;

  if p_occurrence_date is not null and p_type <> 'event' then
    raise exception 'Solo los eventos admiten borrar una fecha concreta' using errcode = 'TW060';
  end if;

  -- El elemento existe, es de mi pareja y lo puedo ver (mismas reglas que la RLS).
  case p_type
    when 'expense' then
      select true, e.concept, not e.visible_to_partner, e.settlement_id is not null
        into v_found, v_label, v_free, v_settled
      from public.expenses e
      where e.id = p_target_id and e.couple_id = v_couple and (e.visible_to_partner or e.created_by = v_uid)
      for update;  -- bloquea el gasto: no se puede saldar a la vez que se pide borrar
    when 'place' then
      select true, p.name, not p.visible_to_partner into v_found, v_label, v_free
      from public.places p
      where p.id = p_target_id and p.couple_id = v_couple and (p.visible_to_partner or p.created_by = v_uid);
    when 'event' then
      -- Un cumpleaños guarda solo el nombre en title: la etiqueta es «Cumpleaños de <nombre>».
      -- [Planificador F6] Un elemento del itinerario (plan_id) se borra sin aprobación, como las tareas; el plan
      -- entero sí la pide.
      select true,
             case when e.category = 'birthday' then 'Cumpleaños de ' || e.title else e.title end,
             e.is_secret or e.plan_id is not null
        into v_found, v_label, v_free
      from public.events e
      where e.id = p_target_id and e.couple_id = v_couple and (not e.is_secret or e.created_by = v_uid);
    when 'recurring_payment' then
      select true, r.name, not r.visible_to_partner into v_found, v_label, v_free
      from public.recurring_payments r
      where r.id = p_target_id and r.couple_id = v_couple and (r.visible_to_partner or r.created_by = v_uid);
    when 'plan' then
      select true, p.icon || ' ' || p.name, false into v_found, v_label, v_free
      from public.plans p where p.id = p_target_id and p.couple_id = v_couple;
    when 'collection' then
      -- [Colecciones] Se bloquea antes de decidir: nadie le añade sitios ni la cambia mientras tanto
      -- (la FK de collection_places pide FOR KEY SHARE). La decisión va en otra sentencia, que ya ve lo confirmado.
      select true, c.icon || ' ' || c.name into v_found, v_label
      from public.collections c
      where c.id = p_target_id and c.couple_id = v_couple and (c.visible_to_partner or c.created_by = v_uid)
      for update;
      if coalesce(v_found, false) then
        v_mode := private.collection_deletion_mode(p_target_id, v_uid);
        v_plan_coll := v_mode = 'plan';
        v_free := v_mode in ('delete', 'leave');
      end if;
    when 'pot_movement' then
      select true,
             case m.kind when 'contribution' then 'Aportación al bote' when 'reimbursement' then 'Reembolso del bote'
                         else 'Ajuste del bote' end || ' · ' || to_char(m.occurred_on, 'DD/MM/YYYY'),
             false
        into v_found, v_label, v_free
      from public.pot_movements m where m.id = p_target_id and m.couple_id = v_couple;
  end case;

  if not coalesce(v_found, false) then
    raise exception 'No encontrado' using errcode = 'TW060';
  elsif v_settled then
    raise exception 'Este gasto ya está saldado: deshaz la liquidación para borrarlo' using errcode = 'TW010';
  elsif v_plan_coll then
    raise exception 'La colección de un plan se borra con el plan' using errcode = 'TW061';
  end if;
  if p_occurrence_date is not null then
    -- Solo «este día» de un evento que se repite, y en una fecha en la que de verdad ocurre: si no, se
    -- crearía una excepción que lo oculta del calendario sin borrarlo (y sin aprobación de un borrado real).
    if not exists (select 1 from public.events e where e.id = p_target_id and e.recurrence <> 'none') then
      raise exception 'Este evento no se repite: bórralo entero, sin fecha' using errcode = 'TW060';
    end if;
    if not exists (select 1 from public.events e
                   cross join lateral private.occurrence_dates(e.start_date, e.recurrence, e.recurrence_until,
                                                               p_occurrence_date, p_occurrence_date) as d(d)
                   where e.id = p_target_id) then
      raise exception 'El evento no ocurre el %', to_char(p_occurrence_date, 'DD/MM/YYYY') using errcode = 'TW060';
    end if;
    if exists (select 1 from public.event_exceptions x where x.event_id = p_target_id and x.occurrence_date = p_occurrence_date) then
      raise exception 'El evento ya no ocurre el %', to_char(p_occurrence_date, 'DD/MM/YYYY') using errcode = 'TW060';
    end if;
    v_label := v_label || ' · ' || to_char(p_occurrence_date, 'DD/MM/YYYY');
  end if;

  -- [Colecciones] Dejarla (R2). Si la pareja ya había pedido borrarla, los dos estáis de acuerdo: se borra.
  if v_mode = 'leave' then
    select * into v_req from public.deletion_requests d
    where d.target_type = 'collection' and d.target_id = p_target_id and d.status = 'pending'
      and d.expires_at > now() and d.requested_by is distinct from v_uid
    for update;
    if found then
      update public.deletion_requests set status = 'approved', decided_by = v_uid, decided_at = now() where id = v_req.id;
      perform private.execute_deletion(p_type, p_target_id, null);
      return jsonb_build_object('status', 'deleted', 'request_id', v_req.id);
    end if;
    perform private.leave_collection(p_target_id, v_uid);
    return jsonb_build_object('status', 'deleted', 'kept_by_partner', true);
  end if;

  -- Sin aprobación: se borra ya.
  if v_free or private.active_member_count(v_couple) = 1 then
    perform private.execute_deletion(p_type, p_target_id, p_occurrence_date);
    return jsonb_build_object('status', 'deleted');
  end if;

  -- Las solicitudes caducadas dejan de contar.
  update public.deletion_requests set status = 'expired', decided_at = now()
  where target_id = p_target_id and status = 'pending' and expires_at <= now();

  -- ¿Ya hay una solicitud pendiente para lo mismo?
  select * into v_req from public.deletion_requests d
  where d.target_type = p_type and d.target_id = p_target_id
    and d.occurrence_date is not distinct from p_occurrence_date and d.status = 'pending'
  for update;
  if found then
    if v_req.requested_by = v_uid then
      return jsonb_build_object('status', 'pending', 'request_id', v_req.id);
    end if;
    -- La pidió la otra persona: los dos estáis de acuerdo.
    update public.deletion_requests set status = 'approved', decided_by = v_uid, decided_at = now() where id = v_req.id;
    perform private.execute_deletion(p_type, p_target_id, p_occurrence_date);
    return jsonb_build_object('status', 'deleted', 'request_id', v_req.id);
  end if;

  insert into public.deletion_requests (id, couple_id, target_type, target_id, occurrence_date, target_label, requested_by)
  values (p_id, v_couple, p_type, p_target_id, p_occurrence_date, left(v_label, 140), v_uid)
  returning * into v_req;
  return jsonb_build_object('status', 'pending', 'request_id', v_req.id);
end $$;

-- -----------------------------------------------------------------------------
-- 6. Permisos explícitos: las funciones de trigger no se conceden a nadie (los triggers no comprueban EXECUTE)
-- -----------------------------------------------------------------------------
revoke all on function private.events_before_write()      from public, anon, authenticated;
revoke all on function private.plan_place_to_collection() from public, anon, authenticated;
revoke all on function public.move_plan(uuid, date, date, integer, boolean) from public, anon;
grant execute on function public.move_plan(uuid, date, date, integer, boolean) to authenticated;
revoke all on function public.request_deletion(uuid, public.deletion_target, uuid, date) from public, anon;
grant execute on function public.request_deletion(uuid, public.deletion_target, uuid, date) to authenticated;

-- PostgREST: que vea la RPC nueva.
notify pgrst, 'reload schema';

commit;

-- =============================================================================
-- PARTE B · Pruebas (no dejan nada: todo acaba en ROLLBACK). Ejecutar como postgres.
-- Si una prueba falla, el script se detiene con «FALLO: ...» y la parte A ya está aplicada.
-- Escrituras «de la app» con set local role authenticated y auth.uid() simulado con request.jwt.claims
-- (se aplican la RLS y los triggers); las comprobaciones, como postgres.
-- No cambia la estructura de ninguna tabla ni toca filas reales: solo una pareja y tres usuarios de prueba.
--   Ana (…0000000000f2, m1), Beto (…0000000000f3, m2) y Ciro (…0000000000f4, sin pareja).
-- =============================================================================
begin;
set local idle_in_transaction_session_timeout = '60s';

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000f2', 'itin-a@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f3', 'itin-b@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000f4', 'itin-c@prueba.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-0000000000f2', 'Ana'),
  ('00000000-0000-4000-8000-0000000000f3', 'Beto'),
  ('00000000-0000-4000-8000-0000000000f4', 'Ciro')
on conflict (id) do update set display_name = excluded.display_name;
insert into public.couples (id) values ('00000000-0000-4000-8000-0000000000fe');
insert into public.couple_settings (couple_id) values ('00000000-0000-4000-8000-0000000000fe') on conflict do nothing;
insert into public.couple_members (couple_id, user_id, slot) values
  ('00000000-0000-4000-8000-0000000000fe', '00000000-0000-4000-8000-0000000000f2', 'm1'),
  ('00000000-0000-4000-8000-0000000000fe', '00000000-0000-4000-8000-0000000000f3', 'm2');

-- Datos de prueba (Ana): planes P1 «Lisboa» (1–4 jun), P2 «Oporto» (1–3 jul) y P3 «Otoño» (25–27 oct, cruza el
-- cambio de hora del 27 oct 2030); sitios S1 compartido y SP privado de Ana; SB compartido de Beto; un evento suelto
-- compartido, uno secreto y un elemento de P1 con el sitio privado de Ana.
do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000fe';
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.plans (id, couple_id, type, name, icon, start_date, end_date) values
    ('00000000-0000-4000-8000-0000000d0001', v_c, 'trip', 'Lisboa', '✈️', '2030-06-01', '2030-06-04'),
    ('00000000-0000-4000-8000-0000000d0002', v_c, 'trip', 'Oporto', '🍷', '2030-07-01', '2030-07-03'),
    ('00000000-0000-4000-8000-0000000d0003', v_c, 'trip', 'Otoño', '🍂', '2030-10-25', '2030-10-27');
  insert into public.places (id, couple_id, name, lat, lng, provider, visible_to_partner) values
    ('00000000-0000-4000-8000-0000000d0201', v_c, 'Miradouro', 38.71, -9.13, 'manual', true),
    ('00000000-0000-4000-8000-0000000d0202', v_c, 'Joyería', 38.72, -9.14, 'manual', false);
  insert into public.events (id, couple_id, title, start_date) values
    ('00000000-0000-4000-8000-0000000d0104', v_c, 'Cena suelta', '2030-06-10');
  insert into public.events (id, couple_id, title, start_date, is_secret) values
    ('00000000-0000-4000-8000-0000000d0105', v_c, 'Sorpresa', '2030-06-12', true);
  insert into public.events (id, couple_id, title, start_date, place_id, plan_id) values
    ('00000000-0000-4000-8000-0000000d0106', v_c, 'Recoger anillo', '2030-06-02', '00000000-0000-4000-8000-0000000d0202',
     '00000000-0000-4000-8000-0000000d0001');
  insert into public.events (id, couple_id, title, start_date, start_time, plan_id) values
    ('00000000-0000-4000-8000-0000000d0107', v_c, 'Castañas', '2030-10-25', '10:00', '00000000-0000-4000-8000-0000000d0003');

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f3","role":"authenticated"}', true);
  insert into public.places (id, couple_id, name, lat, lng, provider, visible_to_partner) values
    ('00000000-0000-4000-8000-0000000d0203', v_c, 'Pastéis', 38.69, -9.20, 'manual', true);
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B1. Estructura y permisos
do $$
begin
  assert exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass
                 and conname = 'events_plan_sin_repetir' and convalidated),
         'FALLO: falta el CHECK events_plan_sin_repetir (validado)';
  assert (select prosrc like '%[Mapa F1]%' and prosrc like '%[Planificador F6]%' and not prosecdef
          from pg_proc where oid = 'private.events_before_write()'::regprocedure),
         'FALLO: events_before_write no parte de la de Mapa F1, no lleva F6 o es security definer';
  assert (select prosrc like '%[Colecciones]%' and prosrc like '%Cumpleaños de%' and prosrc like '%[Planificador F6]%'
                 and prosecdef and proconfig @> array['search_path=""']
          from pg_proc where oid = 'public.request_deletion(uuid, public.deletion_target, uuid, date)'::regprocedure),
         'FALLO: request_deletion no parte de la de Colecciones o perdió security definer';
  assert (select prosecdef and proconfig @> array['search_path=""']
          from pg_proc where oid = 'public.move_plan(uuid, date, date, integer, boolean)'::regprocedure),
         'FALLO: move_plan debe ser security definer con search_path vacío';
  assert (select not prosecdef from pg_proc where oid = 'private.plan_place_to_collection()'::regprocedure),
         'FALLO: plan_place_to_collection debe ser security invoker (la RLS de collection_places decide)';
  assert has_function_privilege('authenticated', 'public.move_plan(uuid, date, date, integer, boolean)', 'execute'),
         'FALLO: authenticated no puede ejecutar move_plan';
  assert not has_function_privilege('anon', 'public.move_plan(uuid, date, date, integer, boolean)', 'execute'),
         'FALLO: anon puede ejecutar move_plan';
  assert not has_function_privilege('authenticated', 'private.plan_place_to_collection()', 'execute')
     and not has_function_privilege('authenticated', 'private.events_before_write()', 'execute'),
         'FALLO: authenticated ejecuta funciones de trigger';
  assert has_function_privilege('authenticated', 'public.request_deletion(uuid, public.deletion_target, uuid, date)', 'execute')
     and not has_function_privilege('anon', 'public.request_deletion(uuid, public.deletion_target, uuid, date)', 'execute'),
         'FALLO: permisos de request_deletion';
  assert (select count(*) = 2 from pg_trigger where not tgisinternal and tgname = 'y_plan_collection'
          and tgfoid = 'private.plan_place_to_collection()'::regprocedure
          and tgrelid in ('public.events'::regclass, 'public.plan_tasks'::regclass)),
         'FALLO: faltan los triggers y_plan_collection en events y plan_tasks';
end $$;

-- B2. Fechas del itinerario: dentro del plan (TW067), sin cambiar de plan (TW069), sin repetir (23514); los eventos
--     sueltos no cambian
do $$
declare
  v_c   constant uuid := '00000000-0000-4000-8000-0000000000fe';
  v_p1  constant uuid := '00000000-0000-4000-8000-0000000d0001';
  v_p2  constant uuid := '00000000-0000-4000-8000-0000000d0002';
  v_s1  constant uuid := '00000000-0000-4000-8000-0000000d0201';
  v_e1  constant uuid := '00000000-0000-4000-8000-0000000d0101';
  v_e2  constant uuid := '00000000-0000-4000-8000-0000000d0102';
  v_e3  constant uuid := '00000000-0000-4000-8000-0000000d0103';
  v_x1  constant uuid := '00000000-0000-4000-8000-0000000d0301';
  v_ok  boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
  set local role authenticated;

  -- Dentro de las fechas: a una hora, todo el día y de dos días con franja
  insert into public.events (id, couple_id, title, start_date, start_time, plan_id, place_id)
  values (v_e1, v_c, 'Tranvía 28', '2030-06-02', '21:30', v_p1, v_s1);
  insert into public.events (id, couple_id, title, start_date, all_day, plan_id)
  values (v_e2, v_c, 'Sintra', '2030-06-04', true, v_p1);
  insert into public.events (id, couple_id, title, start_date, end_date, time_slot, plan_id)
  values (v_e3, v_c, 'Cascais', '2030-06-03', '2030-06-04', 'morning', v_p1);
  -- Un gasto compartido de un elemento del plan hereda el plan (M1, sin cambios)
  insert into public.expenses (id, couple_id, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner, event_id)
  values (v_x1, v_c, 'Billetes tranvía', 600, 'transport', '2030-06-02', 'm1', 'half', true, v_e1);

  -- Antes del inicio, o que acaba después del fin → TW067
  v_ok := false;
  begin
    insert into public.events (couple_id, title, start_date, plan_id) values (v_c, 'Víspera', '2030-05-31', v_p1);
  exception when sqlstate 'TW067' then v_ok := true;
  end;
  assert v_ok, 'FALLO: un elemento antes del inicio del plan no da TW067';
  v_ok := false;
  begin
    insert into public.events (couple_id, title, start_date, end_date, plan_id) values (v_c, 'Alargar', '2030-06-04', '2030-06-05', v_p1);
  exception when sqlstate 'TW067' then v_ok := true;
  end;
  assert v_ok, 'FALLO: un elemento que acaba después del fin del plan no da TW067';

  -- Cambiarlo de día fuera del plan → TW067
  v_ok := false;
  begin
    update public.events set start_date = '2030-06-10' where id = v_e1;
  exception when sqlstate 'TW067' then v_ok := true;
  end;
  assert v_ok, 'FALLO: mover un elemento fuera del plan no da TW067';

  -- Un evento no cambia de plan: ni a otro plan, ni fuera del plan, ni un suelto a un plan → TW069
  v_ok := false;
  begin
    update public.events set plan_id = v_p2 where id = v_e1;
  exception when sqlstate 'TW069' then v_ok := true;
  end;
  assert v_ok, 'FALLO: pasar un elemento a otro plan no da TW069';
  v_ok := false;
  begin
    update public.events set plan_id = null where id = v_e1;
  exception when sqlstate 'TW069' then v_ok := true;
  end;
  assert v_ok, 'FALLO: sacar un elemento del plan no da TW069';
  v_ok := false;
  begin
    update public.events set plan_id = v_p1 where id = '00000000-0000-4000-8000-0000000d0104';
  exception when sqlstate 'TW069' then v_ok := true;
  end;
  assert v_ok, 'FALLO: meter un evento suelto en un plan no da TW069';

  -- Un elemento del itinerario no se repite → 23514
  v_ok := false;
  begin
    insert into public.events (couple_id, title, start_date, plan_id, recurrence) values (v_c, 'Cada semana', '2030-06-02', v_p1, 'weekly');
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: un elemento del itinerario que se repite se guarda';

  -- Editarlo dentro de su plan, sí: día dentro de las fechas, título, sitio y el mismo plan_id; los eventos sueltos,
  -- en cualquier fecha y repetidos, como siempre
  update public.events set start_date = '2030-06-03' where id = v_e1;
  update public.events set start_date = '2030-06-02', plan_id = v_p1 where id = v_e1;
  update public.events set title = 'Cascais y Estoril', place_id = v_s1 where id = v_e3;
  insert into public.events (couple_id, title, start_date, recurrence) values (v_c, 'Yoga', '2030-12-01', 'weekly');
  update public.events set start_date = '2030-06-20' where id = '00000000-0000-4000-8000-0000000d0104';
  update public.events set start_date = '2030-06-10' where id = '00000000-0000-4000-8000-0000000d0104';
  reset role;

  assert (select start_date = '2030-06-02' and starts_at = ('2030-06-02 21:30'::timestamp at time zone time_zone)
          from public.events where id = v_e1), 'FALLO: el elemento cambió de día o de hora';
  assert (select plan_id = v_p1 from public.expenses where id = v_x1), 'FALLO: el gasto del elemento no heredó el plan';
  assert (select title = 'Cascais y Estoril' and place_id = v_s1 and plan_id = v_p1 from public.events where id = v_e3),
         'FALLO: no se pudo editar el título y el sitio de un elemento';
  assert (select plan_id is null from public.events where id = '00000000-0000-4000-8000-0000000d0104'),
         'FALLO: el evento suelto entró en un plan';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B3. Sitios del itinerario y de las tareas → colección del plan
do $$
declare
  v_c    constant uuid := '00000000-0000-4000-8000-0000000000fe';
  v_ana  constant uuid := '00000000-0000-4000-8000-0000000000f2';
  v_beto constant uuid := '00000000-0000-4000-8000-0000000000f3';
  v_p1   constant uuid := '00000000-0000-4000-8000-0000000d0001';
  v_s1   constant uuid := '00000000-0000-4000-8000-0000000d0201';
  v_sp   constant uuid := '00000000-0000-4000-8000-0000000d0202';
  v_sb   constant uuid := '00000000-0000-4000-8000-0000000d0203';
  v_e1   constant uuid := '00000000-0000-4000-8000-0000000d0101';
  v_e2   constant uuid := '00000000-0000-4000-8000-0000000d0102';
  v_e5   constant uuid := '00000000-0000-4000-8000-0000000d0108';
  v_ep   constant uuid := '00000000-0000-4000-8000-0000000d0106';  -- elemento de Ana con su sitio privado
  v_t1   constant uuid := '00000000-0000-4000-8000-0000000d0401';
  v_col  uuid;
  v_ok   boolean;
begin
  select id into v_col from public.collections where plan_id = v_p1;
  assert v_col is not null, 'FALLO: el plan no tiene colección';
  assert (select count(*) = 1 and bool_and(added_by = v_ana) from public.collection_places
          where collection_id = v_col and place_id = v_s1),
         'FALLO: el sitio del elemento no entró en la colección del plan (una vez, añadido por Ana)';

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
  set local role authenticated;
  -- Otro elemento con el mismo sitio: no se duplica
  insert into public.events (id, couple_id, title, start_date, plan_id, place_id)
  values (v_e5, v_c, 'Atardecer', '2030-06-01', v_p1, v_s1);
  -- Ana pone su sitio privado en un elemento: entra (ella lo ve); quitárselo no lo saca de la colección
  update public.events set place_id = v_sp where id = v_e2;
  update public.events set place_id = null where id = v_e2;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f3","role":"authenticated"}', true);
  -- Beto: tarea con su sitio → entra, añadido por Beto
  insert into public.plan_tasks (id, couple_id, plan_id, kind, title, place_id, event_id)
  values (v_t1, v_c, v_p1, 'booking', 'Pastéis', v_sb, v_e1);
  -- Beto no puede meter en el plan el evento suelto compartido de Ana (lo borraría después sin aprobación) → TW069
  v_ok := false;
  begin
    update public.events set plan_id = v_p1 where id = '00000000-0000-4000-8000-0000000d0104';
  exception when sqlstate 'TW069' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Beto mete en un plan el evento suelto de Ana';
  -- Beto no puede poner el sitio privado de Ana en un elemento (TW064, ya lo hacía events_before_write)
  v_ok := false;
  begin
    insert into public.events (couple_id, title, start_date, plan_id, place_id) values (v_c, 'Espiar', '2030-06-02', v_p1, v_sp);
  exception when sqlstate 'TW064' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Beto pone el sitio privado de Ana en un elemento del itinerario';
  -- Un evento suelto con sitio no toca ninguna colección
  insert into public.events (couple_id, title, start_date, place_id) values (v_c, 'Café', '2030-06-02', v_sb);

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
  -- Ana quita S1 de la colección a mano; editar otra cosa de sus elementos no lo vuelve a meter
  delete from public.collection_places where collection_id = v_col and place_id = v_s1;
  update public.events set title = 'Atardecer en el Miradouro' where id = v_e5;
  update public.events set title = 'Recoger el anillo' where id = v_ep;
  -- Tampoco si la app manda el mismo sitio y el mismo plan (el trigger salta por «update of place_id, plan_id»)
  update public.events set place_id = v_s1, plan_id = v_p1, position = 2 where id = v_e5;
  reset role;

  assert not exists (select 1 from public.collection_places where collection_id = v_col and place_id = v_s1),
         'FALLO: editar un elemento volvió a meter un sitio quitado a mano';
  assert (select count(*) = 1 and bool_and(added_by = v_ana) from public.collection_places
          where collection_id = v_col and place_id = v_sp),
         'FALLO: el sitio privado de Ana no entró en la colección, o salió al quitarlo del elemento';
  assert (select count(*) = 1 and bool_and(added_by = v_beto) from public.collection_places
          where collection_id = v_col and place_id = v_sb),
         'FALLO: el sitio de la tarea de Beto no entró en la colección del plan (o el evento suelto lo metió en otra)';

  -- Volver a poner el sitio en un elemento sí lo mete otra vez
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
  set local role authenticated;
  update public.events set place_id = null where id = v_e5;
  update public.events set place_id = v_s1 where id = v_e5;
  reset role;
  assert exists (select 1 from public.collection_places where collection_id = v_col and place_id = v_s1),
         'FALLO: volver a poner el sitio en un elemento no lo metió en la colección';
  assert (select count(*) = 3 from public.collection_places where collection_id = v_col),
         'FALLO: la colección del plan no tiene 3 sitios';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B4. Mover el plan de fechas: con y sin itinerario, versión vieja, errores, zona horaria
do $$
declare
  v_p1  constant uuid := '00000000-0000-4000-8000-0000000d0001';
  v_p3  constant uuid := '00000000-0000-4000-8000-0000000d0003';
  v_e1  constant uuid := '00000000-0000-4000-8000-0000000d0101';
  v_e2  constant uuid := '00000000-0000-4000-8000-0000000d0102';
  v_e3  constant uuid := '00000000-0000-4000-8000-0000000d0103';
  v_e4  constant uuid := '00000000-0000-4000-8000-0000000d0107';
  v_e5  constant uuid := '00000000-0000-4000-8000-0000000d0108';
  v_ep  constant uuid := '00000000-0000-4000-8000-0000000d0106';
  v_el  constant uuid := '00000000-0000-4000-8000-0000000d0104';
  v_x1  constant uuid := '00000000-0000-4000-8000-0000000d0301';
  v_v   integer;
  v_n   integer;
  v_r   jsonb;
  v_ok  boolean;
begin
  select version into v_v from public.plans where id = v_p1;
  select count(*) into v_n from public.events where plan_id = v_p1;
  assert v_n = 5, 'FALLO: el plan debería tener 5 elementos y tiene ' || v_n;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
  set local role authenticated;

  -- Versión vieja → TW068; plan que no existe → TW060; más de 60 días o fin antes del inicio → 23514
  v_ok := false;
  begin
    perform public.move_plan(v_p1, '2030-06-03', '2030-06-06', v_v - 1, true);
  exception when sqlstate 'TW068' then v_ok := true;
  end;
  assert v_ok, 'FALLO: mover con una versión vieja no da TW068';
  v_ok := false;
  begin
    perform public.move_plan(gen_random_uuid(), '2030-06-03', '2030-06-06', 1, true);
  exception when sqlstate 'TW060' then v_ok := true;
  end;
  assert v_ok, 'FALLO: mover un plan que no existe no da TW060';
  v_ok := false;
  begin
    perform public.move_plan(v_p1, '2030-06-01', '2030-07-31', v_v, true);
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: mover a un plan de más de 60 días se guarda';
  v_ok := false;
  begin
    perform public.move_plan(v_p1, '2030-06-05', '2030-06-04', v_v, true);
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: mover con el fin antes del inicio se guarda';

  -- Ciro (sin pareja) → TW001
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f4","role":"authenticated"}', true);
  v_ok := false;
  begin
    perform public.move_plan(v_p1, '2030-06-03', '2030-06-06', v_v, true);
  exception when sqlstate 'TW001' then v_ok := true;
  end;
  assert v_ok, 'FALLO: alguien sin pareja mueve un plan';

  -- Con itinerario: +2 días. Todo se mueve igual; nada queda fuera
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
  v_r := public.move_plan(v_p1, '2030-06-03', '2030-06-06', v_v, true);
  reset role;
  assert (v_r ->> 'moved')::int = 5 and (v_r ->> 'outside')::int = 0
         and (v_r ->> 'version')::int = v_v + 1
         and (v_r ->> 'version')::int = (select version from public.plans where id = v_p1),
         'FALLO: move_plan con itinerario devuelve ' || v_r::text;
  assert (select start_date = '2030-06-03' and end_date = '2030-06-06' from public.plans where id = v_p1),
         'FALLO: el plan no cambió de fechas';
  assert (select start_date = '2030-06-04' and start_time = '21:30' and end_date is null
                 and starts_at = ('2030-06-04 21:30'::timestamp at time zone time_zone)
          from public.events where id = v_e1), 'FALLO: el elemento a una hora no se movió bien';
  assert (select start_date = '2030-06-06' and all_day and start_time is null and end_date is null
                 and starts_at = ('2030-06-06'::date::timestamp at time zone time_zone)
                 and ends_at = ('2030-06-07'::date::timestamp at time zone time_zone)
          from public.events where id = v_e2), 'FALLO: el elemento de todo el día no se movió bien';
  assert (select start_date = '2030-06-05' and end_date = '2030-06-06' and time_slot = 'morning'
          from public.events where id = v_e3), 'FALLO: el elemento de dos días no se movió bien';
  assert (select start_date = '2030-06-03' from public.events where id = v_e5)
     and (select start_date = '2030-06-04' from public.events where id = v_ep),
         'FALLO: algún elemento no se movió';
  assert (select start_date = '2030-06-10' from public.events where id = v_el), 'FALLO: se movió un evento suelto';
  assert (select spent_on = '2030-06-02' and plan_id = v_p1 and event_id = v_e1 from public.expenses where id = v_x1),
         'FALLO: el gasto del elemento se movió o perdió el plan';

  -- Sin itinerario: el plan vuelve a 1–3 jun y los elementos se quedan; 4 quedan fuera
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
  set local role authenticated;
  v_r := public.move_plan(v_p1, '2030-06-01', '2030-06-03', v_v + 1, false);
  assert (v_r ->> 'moved')::int = 0 and (v_r ->> 'outside')::int = 4,
         'FALLO: move_plan sin itinerario devuelve ' || v_r::text;
  -- Un elemento fuera se puede editar sin moverlo, no se puede mover a otro día fuera y sí a uno del plan
  update public.events set title = 'Palacio da Pena' where id = v_e2;
  v_ok := false;
  begin
    update public.events set start_date = '2030-06-07' where id = v_e2;
  exception when sqlstate 'TW067' then v_ok := true;
  end;
  assert v_ok, 'FALLO: mover un elemento fuera a otro día fuera no da TW067';
  update public.events set start_date = '2030-06-02' where id = v_e2;

  -- Con itinerario y acortándolo (+1 día, de 3 a 2 días): se mueve todo y lo que cae después del fin queda fuera
  v_r := public.move_plan(v_p1, '2030-06-02', '2030-06-03', v_v + 2, true);
  reset role;
  assert (v_r ->> 'moved')::int = 5 and (v_r ->> 'outside')::int = 4,
         'FALLO: move_plan acortando devuelve ' || v_r::text;
  assert (select start_date = '2030-06-03' and title = 'Palacio da Pena' from public.events where id = v_e2)
     and (select start_date = '2030-06-05' from public.events where id = v_e1),
         'FALLO: al acortar el plan los elementos no se movieron el mismo número de días';

  -- Beto mueve P3 una semana, cruzando el cambio de hora: la hora local (10:00) se conserva
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f3","role":"authenticated"}', true);
  set local role authenticated;
  v_r := public.move_plan(v_p3, '2030-11-01', '2030-11-03', (select version from public.plans where id = v_p3), true);
  reset role;
  assert (v_r ->> 'moved')::int = 1, 'FALLO: Beto no pudo mover el plan de Ana (' || v_r::text || ')';
  assert (select start_date = '2030-11-01' and start_time = '10:00'
                 and starts_at = ('2030-11-01 10:00'::timestamp at time zone time_zone)
                 and extract(hour from starts_at at time zone time_zone) = 10
          from public.events where id = v_e4), 'FALLO: al cruzar el cambio de hora el elemento cambió de hora local';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B5. Borrar: un elemento del itinerario, al momento; un evento suelto y el plan, con aprobación
do $$
declare
  v_p1  constant uuid := '00000000-0000-4000-8000-0000000d0001';
  v_p2  constant uuid := '00000000-0000-4000-8000-0000000d0002';
  v_s1  constant uuid := '00000000-0000-4000-8000-0000000d0201';
  v_e1  constant uuid := '00000000-0000-4000-8000-0000000d0101';
  v_e3  constant uuid := '00000000-0000-4000-8000-0000000d0103';
  v_el  constant uuid := '00000000-0000-4000-8000-0000000d0104';
  v_es  constant uuid := '00000000-0000-4000-8000-0000000d0105';
  v_x1  constant uuid := '00000000-0000-4000-8000-0000000d0301';
  v_t1  constant uuid := '00000000-0000-4000-8000-0000000d0401';
  v_r   jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f2","role":"authenticated"}', true);
  set local role authenticated;
  v_r := public.request_deletion(gen_random_uuid(), 'event', v_e1);
  assert v_r ->> 'status' = 'deleted' and not v_r ? 'request_id',
         'FALLO: borrar un elemento del itinerario pide aprobación (' || v_r::text || ')';
  v_r := public.request_deletion(gen_random_uuid(), 'event', v_el);
  assert v_r ->> 'status' = 'pending', 'FALLO: borrar un evento suelto compartido ya no pide aprobación (' || v_r::text || ')';
  v_r := public.request_deletion(gen_random_uuid(), 'event', v_es);
  assert v_r ->> 'status' = 'deleted', 'FALLO: borrar un evento secreto pide aprobación (' || v_r::text || ')';
  v_r := public.request_deletion(gen_random_uuid(), 'plan', v_p2);
  assert v_r ->> 'status' = 'pending', 'FALLO: borrar un plan ya no pide aprobación (' || v_r::text || ')';

  -- Beto borra un elemento que creó Ana: también al momento
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000f3","role":"authenticated"}', true);
  v_r := public.request_deletion(gen_random_uuid(), 'event', v_e3);
  assert v_r ->> 'status' = 'deleted', 'FALLO: Beto no puede borrar un elemento del itinerario de Ana (' || v_r::text || ')';
  reset role;

  assert not exists (select 1 from public.events where id in (v_e1, v_e3, v_es)), 'FALLO: no se borraron los elementos';
  assert exists (select 1 from public.events where id = v_el), 'FALLO: el evento suelto se borró sin aprobación';
  assert exists (select 1 from public.plans where id = v_p2), 'FALLO: el plan se borró sin aprobación';
  assert (select plan_id = v_p1 and event_id is null and event_title_snapshot = 'Tranvía 28'
          from public.expenses where id = v_x1),
         'FALLO: el gasto del elemento borrado perdió el plan o el título del evento';
  assert (select event_id is null from public.plan_tasks where id = v_t1), 'FALLO: la tarea sigue enlazada al elemento borrado';
  assert exists (select 1 from public.collection_places cp join public.collections c on c.id = cp.collection_id
                 where c.plan_id = v_p1 and cp.place_id = v_s1),
         'FALLO: borrar el elemento sacó su sitio de la colección del plan';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B6. Final
do $$
begin
  raise notice 'PRUEBAS DE ITINERARIO (F6): todas correctas';
end $$;

rollback;
