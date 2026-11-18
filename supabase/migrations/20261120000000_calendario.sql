-- =============================================================================
-- ito · Calendario (docs/plan-calendario.md §5)
--   1. calendar_range: los pagos pasados salen de recurring_occurrences (lo que de verdad se cobró, menos
--      los saltados, aunque el recurrente esté en pausa); los futuros se calculan desde «hoy» y active_from,
--      solo si no está en pausa y sin repetir un periodo que ya tiene cobro (la misma regla que el job).
--      Devuelve además recurrence, attendees, is_secret y occurrence_id. Rango de como mucho 100 días (TW052).
--   2. events_before_write: la zona horaria del evento es la de la pareja al crearlo (no la elige el
--      cliente) y no cambia al editarlo.
--   3. event_exceptions: solo lectura desde el cliente. Las crea execute_deletion (security definer) al
--      aprobarse el borrado de «solo este día».
--      Los eventos ya guardados pasan a la zona de la pareja (2a).
--   4. request_deletion: con fecha, solo si el evento se repite, esa fecha es una de sus repeticiones y no
--      está ya anulada (TW060). Si cambia la serie, se cancelan las solicitudes de «solo este día» (4b).
--   5. pending_actions: «¿Quién pagó?» solo a quien fue (attendees = both o su hueco).
--   NO se pone REPLICA IDENTITY FULL en events (§5.7): los DELETE llevarían el título de un secreto a la pareja.
-- NO aplicada: la ejecuta David en el SQL Editor. Idempotente: se puede volver a ejecutar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. calendar_range
--    Cambia el tipo de salida (4 columnas nuevas al final), así que hay que borrarla y crearla.
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
  occurrence_id uuid       -- pagos: el cobro de recurring_occurrences, si ya existe (null si es previsto)
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
  select 'event'::text, e.id, d.d, d.d + (coalesce(e.end_date, e.start_date) - e.start_date),
         e.title, null::text, e.start_time, e.all_day, e.place_id, e.plan_id,
         e.budget_cents, false, null::text,
         e.recurrence::text, e.attendees::text, e.is_secret, null::uuid
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
         null::text, null::text, false, o.id
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
         null::text, null::text, false, null::uuid
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
         null::text, null::text, false, null::uuid
  from public.plans p
  where p.couple_id = v_couple
    and p.start_date <= p_to and p.end_date >= p_from
  order by 3, 7 nulls first, 5;
end $$;

revoke all on function public.calendar_range(date, date) from public, anon;
grant execute on function public.calendar_range(date, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 2a. Eventos ya creados con otra zona (la que mandó el cliente o la de por defecto): pasan a la de la
--     pareja. Va ANTES de cambiar el trigger: el de ahora recalcula starts_at / ends_at con la zona nueva;
--     el de después la conservaría. Al volver a ejecutar la migración no encuentra filas.
-- -----------------------------------------------------------------------------
update public.events e
   set time_zone = c.time_zone
  from public.couples c
 where c.id = e.couple_id and e.time_zone is distinct from c.time_zone;

-- -----------------------------------------------------------------------------
-- 2. events_before_write: zona horaria de la pareja
--    Al crear se fija couples.time_zone (lo que mande el cliente se ignora); al editar se mantiene la que
--    tenía. Así una pareja en Canarias, o un móvil en otra zona, no desplaza starts_at / ends_at.
--    Sin security definer: la RLS de couples deja leer la propia pareja; si el couple_id no es el tuyo,
--    no se lee nada y la política de INSERT de events lo rechaza igualmente.
-- -----------------------------------------------------------------------------
create or replace function private.events_before_write() returns trigger
language plpgsql set search_path = '' as $$
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
  return new;
end $$;
revoke all on function private.events_before_write() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. event_exceptions: solo lectura desde el cliente
--    Antes cualquiera podía anular una fecha (insert) saltándose la aprobación. Ahora solo las crea
--    private.execute_deletion (security definer, propietario postgres: no le afectan RLS ni grants).
--    La política de lectura es la misma que había (hereda la visibilidad del evento), así que Realtime
--    sigue entregando las altas a quien ve el evento.
-- -----------------------------------------------------------------------------
drop policy if exists event_exceptions_all on public.event_exceptions;
drop policy if exists event_exceptions_select on public.event_exceptions;
create policy event_exceptions_select on public.event_exceptions for select to authenticated
  using (couple_id = (select private.my_couple_id())
         and exists (select 1 from public.events e where e.id = event_exceptions.event_id));
revoke insert, update, delete, truncate on public.event_exceptions from authenticated, anon;
grant select on public.event_exceptions to authenticated;

-- -----------------------------------------------------------------------------
-- 4. request_deletion: una fecha concreta solo en un evento que se repite y en una de sus fechas
--    (igual que en 20261117010000_saldar_seguro.sql salvo esa comprobación). create or replace
--    conserva los grants.
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
      select true, e.title, e.is_secret into v_found, v_label, v_free
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
      select true, c.icon || ' ' || c.name,
             not c.visible_to_partner or not exists (select 1 from public.collection_places cp where cp.collection_id = c.id),
             c.plan_id is not null
        into v_found, v_label, v_free, v_plan_coll
      from public.collections c
      where c.id = p_target_id and c.couple_id = v_couple and (c.visible_to_partner or c.created_by = v_uid);
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
-- 4b. Si cambia la serie (fecha de inicio o repetición), las solicitudes de «solo este día» pendientes se
--     cancelan: esa fecha puede haber dejado de ser una repetición. Escenario sin esto: David pide borrar
--     «solo el 15 mar» de un evento anual, Meri lo cambia a «no se repite» con fecha 15 mar y luego aprueba →
--     se crea una excepción que oculta el evento del calendario sin borrarlo (sigue su «¿Quién pagó?», etc.).
--     security definer: el cliente no puede escribir en deletion_requests.
-- -----------------------------------------------------------------------------
create or replace function private.events_cancel_date_requests() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.deletion_requests set status = 'cancelled', decided_at = now()
  where target_type = 'event' and target_id = new.id and occurrence_date is not null and status = 'pending';
  return null;
end $$;
revoke all on function private.events_cancel_date_requests() from public, anon, authenticated;

drop trigger if exists y_cancel_date_requests on public.events;
create trigger y_cancel_date_requests after update on public.events
  for each row
  when (old.start_date is distinct from new.start_date
        or old.recurrence is distinct from new.recurrence
        or old.recurrence_until is distinct from new.recurrence_until)
  execute function private.events_cancel_date_requests();

-- -----------------------------------------------------------------------------
-- 5. pending_actions: «¿Quién pagó?» solo a quien fue
--    Mismas columnas y ramas que en el esquema inicial; solo cambia who_paid (attendees). create or
--    replace conserva los grants (mismas columnas, mismos tipos y mismo orden).
-- -----------------------------------------------------------------------------
create or replace view public.pending_actions with (security_invoker = true) as
select 'confirm_settlement'::text as kind, s.id as item_id, s.couple_id, s.created_at as since,
       s.amount_cents, null::text as title
from public.settlements s
where s.status = 'pending' and s.to_slot = (select private.my_slot())
  and s.couple_id = (select private.my_couple_id())
union all
select 'who_paid', e.id, e.couple_id, e.ends_at, e.budget_cents, e.title
from public.events e
where e.ask_who_paid and e.who_paid_resolved_at is null and e.ends_at <= now()
  and e.couple_id = (select private.my_couple_id())
  and (e.attendees = 'both' or e.attendees::text = (select private.my_slot())::text)
union all
select 'variable_amount', o.id, o.couple_id, o.created_at, r.amount_cents, r.name
from public.recurring_occurrences o
join public.recurring_payments r on r.id = o.recurring_id
where o.status = 'pending' and o.couple_id = (select private.my_couple_id())
union all
select 'settings_proposal', p.id, p.couple_id, p.created_at, null::integer, null::text
from public.settings_proposals p
where p.status = 'pending' and p.proposed_by is distinct from (select auth.uid())
  and p.couple_id = (select private.my_couple_id())
union all
select 'approve_deletion', d.id, d.couple_id, d.created_at, null::integer, d.target_label
from public.deletion_requests d
where d.status = 'pending' and d.expires_at > now() and d.requested_by is distinct from (select auth.uid())
  and d.couple_id = (select private.my_couple_id());

-- PostgREST: que vea ya la nueva firma de calendar_range.
notify pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- Comprobación (SQL Editor, tras aplicar). Las RPC usan auth.uid(): para probarlas como un usuario,
-- dentro de una transacción:
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<uuid de David>","role":"authenticated"}', true);
--   ... consulta ...
--   rollback;
--
-- 1) Rango de 200 días → error TW052:
--      select * from public.calendar_range(current_date, current_date + 200);
--    Y uno de 42 días funciona y trae las columnas nuevas:
--      select kind, occurs_on, title, status, recurrence, attendees, is_secret, occurrence_id
--      from public.calendar_range(current_date - 10, current_date + 31);
--
-- 2) Insertar en event_exceptions desde la API → rechazado (permission denied for table event_exceptions):
--      insert into public.event_exceptions (event_id, couple_id, occurrence_date)
--      select id, couple_id, start_date from public.events limit 1;
--    Y leer sigue funcionando: select * from public.event_exceptions;
--
-- 3) request_deletion con fecha en un evento que no se repite → TW060 «Este evento no se repite…»:
--      select public.request_deletion(gen_random_uuid(), 'event', '<id de un evento con recurrence = none>', current_date);
--    Con un evento repetido y una fecha que no es suya (p. ej. start_date + 1 en uno semanal) → TW060 «El evento no ocurre el…».
--
-- 4) Pausar un recurrente ya cobrado → su cobro sigue saliendo (status paid y occurrence_id), y los
--    futuros desaparecen:
--      update public.recurring_payments set paused = true where id = '<id con un cobro este mes>';
--      select occurs_on, status, occurrence_id from public.calendar_range(date_trunc('month', current_date)::date,
--             (date_trunc('month', current_date) + interval '2 months - 1 day')::date)
--      where kind = 'payment' and source_id = '<id>';
--
-- 5) Evento con time_zone falso → se guarda el de la pareja (y starts_at en esa zona):
--      insert into public.events (couple_id, title, start_date, start_time, time_zone)
--      values ((select private.my_couple_id()), 'Prueba zona', current_date, '21:30', 'Pacific/Auckland')
--      returning time_zone, starts_at, ends_at;
-- -----------------------------------------------------------------------------
