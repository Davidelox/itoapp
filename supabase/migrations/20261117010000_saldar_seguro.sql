-- =============================================================================
-- ito · Saldar y borrar más seguros (revisión del arquitecto, fase 2 de Gastos)
-- 2026-11-17 · Ver docs/plan-gastos-fase2.md.
-- NO aplicada: la ejecuta David en el SQL Editor. Se puede ejecutar más de una vez.
--
-- 1. create_settlement acepta p_expected_cents: el importe que vio quien pulsa. Si no coincide con lo
--    que calcula el servidor (alguien editó o añadió un gasto entretanto), responde TW020 y no registra nada.
--    Es opcional (default null): las llamadas antiguas siguen funcionando igual.
-- 2. undo_settlement solo deshace un pago pendiente, o uno confirmado por la misma persona que lo
--    registró y en sus primeros 10 minutos. Ya no se puede borrar una confirmación de la otra persona
--    ni el registro de un rechazo.
-- 3. request_deletion bloquea el gasto (for update) para que no se pueda saldar a la vez.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. create_settlement con importe esperado
--    Se borra la versión de 4 parámetros: si conviviera con la de 5, PostgREST no sabría cuál usar.
-- -----------------------------------------------------------------------------
drop function if exists public.create_settlement(uuid, uuid[], public.settlement_method, text);
drop function if exists public.create_settlement(uuid, uuid[], public.settlement_method, text, bigint);

create function public.create_settlement(p_id uuid, p_expense_ids uuid[], p_method public.settlement_method,
                                         p_note text default null, p_expected_cents bigint default null)
returns public.settlements
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_couple uuid := private.my_couple_id();
  v_slot   public.party := private.my_slot();
  v_ids    uuid[];
  v_n      integer;
  v_net    bigint;
  v_from   public.party;
  v_to     public.party;
  v_row    public.settlements;
begin
  if v_couple is null then
    raise exception 'No perteneces a ninguna pareja' using errcode = 'TW001';
  end if;

  select * into v_row from public.settlements s where s.id = p_id;
  if found then
    if v_row.couple_id <> v_couple then
      raise exception 'Liquidación no válida' using errcode = 'TW020';
    end if;
    return v_row;  -- reintento: misma respuesta
  end if;

  select array_agg(distinct x) into v_ids from unnest(p_expense_ids) as x where x is not null;
  if v_ids is null then
    raise exception 'Elige al menos un gasto' using errcode = 'TW020';
  end if;

  -- Bloquea los gastos: dos liquidaciones simultáneas no pueden cubrir el mismo gasto.
  perform 1 from public.expenses e where e.id = any (v_ids) and e.couple_id = v_couple order by e.id for update;

  select count(*),
         coalesce(sum(case e.paid_by when 'm1' then e.share_m2_cents when 'm2' then -e.share_m1_cents else 0 end), 0)
    into v_n, v_net
  from public.expenses e
  where e.id = any (v_ids) and e.couple_id = v_couple and e.settlement_id is null and e.visible_to_partner
    and (case e.paid_by when 'm1' then e.share_m2_cents when 'm2' then e.share_m1_cents else 0 end) <> 0
    -- un gasto con una solicitud de borrado pendiente no se puede saldar hasta que se resuelva
    and not exists (select 1 from public.deletion_requests d
                    where d.target_id = e.id and d.status = 'pending' and d.expires_at > now());

  if v_n <> cardinality(v_ids) then
    raise exception 'Algún gasto no existe, ya está saldado, no genera deuda o está pendiente de borrar'
      using errcode = 'TW020';
  end if;

  -- Lo que vio quien pulsa (con signo, visto desde m1: > 0 = m2 debe a m1). Si algo ha cambiado
  -- entretanto (un gasto editado o nuevo), no se registra un importe que nadie ha visto.
  if p_expected_cents is not null and p_expected_cents <> v_net then
    raise exception 'El importe ha cambiado: revisa la lista' using errcode = 'TW020';
  end if;

  if v_net >= 0 then v_from := 'm2'; v_to := 'm1'; else v_from := 'm1'; v_to := 'm2'; end if;

  insert into public.settlements (id, couple_id, from_slot, to_slot, amount_cents, method, status, note,
                                  created_by, responded_by, responded_at)
  values (p_id, v_couple, v_from, v_to, abs(v_net)::integer, p_method,
          case when v_net = 0 or v_to = v_slot then 'confirmed' else 'pending' end::public.settlement_status,
          p_note, v_uid,
          case when v_net = 0 or v_to = v_slot then v_uid end,
          case when v_net = 0 or v_to = v_slot then now() end)
  returning * into v_row;

  update public.expenses set settlement_id = p_id where id = any (v_ids);
  return v_row;
end $$;

revoke all on function public.create_settlement(uuid, uuid[], public.settlement_method, text, bigint) from public, anon;
grant execute on function public.create_settlement(uuid, uuid[], public.settlement_method, text, bigint) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. undo_settlement: no se deshace lo que ha respondido la otra persona
-- -----------------------------------------------------------------------------
create or replace function public.undo_settlement(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.settlements;
begin
  select * into v_row from public.settlements s
  where s.id = p_id and s.couple_id = private.my_couple_id() for update;
  if not found then
    raise exception 'Liquidación no encontrada' using errcode = 'TW022';
  elsif v_row.created_by is distinct from auth.uid() then
    raise exception 'Solo quien la registró puede deshacerla' using errcode = 'TW022';
  elsif v_row.status = 'rejected' then
    raise exception 'Un pago rechazado no se deshace' using errcode = 'TW022';
  elsif v_row.status = 'confirmed'
        and (v_row.responded_by is distinct from v_row.created_by
             or v_row.created_at < now() - interval '10 minutes') then
    raise exception 'Ya no se puede deshacer' using errcode = 'TW022';
  end if;
  delete from public.settlements where id = p_id;  -- ON DELETE SET NULL libera los gastos
end $$;

-- -----------------------------------------------------------------------------
-- 3. request_deletion: bloquea el gasto mientras se pide borrar
--    (igual que en el esquema inicial salvo el «for update» de la rama 'expense')
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
