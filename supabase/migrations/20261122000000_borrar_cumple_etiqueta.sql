-- =============================================================================
-- ito · Etiqueta «Cumpleaños de X» al pedir borrar un cumpleaños
--   1. request_deletion: en un evento de categoría 'birthday' la etiqueta que se guarda en la solicitud (y que
--      sale en el aviso de la pareja, vista pending_actions) es «Cumpleaños de <nombre>» y no solo el nombre.
--      El resto del cuerpo es idéntico a 20261120000000_calendario.sql §4.
--   2. Las solicitudes pendientes de cumpleaños ya guardadas pasan a la etiqueta nueva.
--   Sin riesgo con los secretos: un cumpleaños no puede ser secreto (CHECK events_cumple) y la etiqueta solo se
--   construye con eventos que el usuario ve; un evento secreto se borra al momento, sin guardar solicitud.
-- Requiere 20261121000000_calendario_v2.sql aplicada antes (columna events.category).
-- NO aplicada: la ejecuta David en el SQL Editor. Idempotente: se puede volver a ejecutar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Requisito: 20261121000000_calendario_v2.sql (columna events.category)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'events' and column_name = 'category'
  ) then
    raise exception 'Aplica antes 20261121000000_calendario_v2.sql';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. request_deletion
--    security definer con search_path vacío; la pareja sale de private.my_couple_id() (auth.uid()) y cada
--    rama comprueba couple_id y la misma visibilidad que la RLS.
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
      -- Un cumpleaños guarda solo el nombre en title: la etiqueta es «Cumpleaños de <nombre>».
      select true,
             case when e.category = 'birthday' then 'Cumpleaños de ' || e.title else e.title end,
             e.is_secret
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

revoke all on function public.request_deletion(uuid, public.deletion_target, uuid, date) from public, anon;
grant execute on function public.request_deletion(uuid, public.deletion_target, uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Solicitudes pendientes de cumpleaños ya guardadas (la etiqueta era el nombre, con « · fecha» si era un
--    día). Al volver a ejecutar la migración no encuentra filas.
-- -----------------------------------------------------------------------------
update public.deletion_requests d
   set target_label = left('Cumpleaños de ' || d.target_label, 140)
  from public.events e
 where d.target_type = 'event' and d.target_id = e.id and e.category = 'birthday'
   and d.status = 'pending' and d.target_label not like 'Cumpleaños de %';

-- -----------------------------------------------------------------------------
-- COMPROBACIÓN (SQL Editor; todo con rollback). Necesita una pareja con los dos miembros activos.
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<tu uid>","role":"authenticated"}', true);
--   insert into public.events (id, couple_id, title, start_date, all_day, recurrence, category)
--   values ('00000000-0000-0000-0000-0000000000c1', (select private.my_couple_id()), 'Lucía', '2000-12-17', true, 'yearly', 'birthday');
--   select public.request_deletion(gen_random_uuid(), 'event', '00000000-0000-0000-0000-0000000000c1');
--   select target_label from public.deletion_requests where target_id = '00000000-0000-0000-0000-0000000000c1';
--     → «Cumpleaños de Lucía»
--   rollback;
-- -----------------------------------------------------------------------------
