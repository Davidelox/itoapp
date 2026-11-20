-- =============================================================================
-- ito · Borrar colecciones: permiso solo si la pareja ha puesto sitios; si no, la pareja la conserva
-- (docs/modelo-datos.md §6 y §8, docs/plan-mapa.md §10)
--
-- Reglas (en orden; la primera que se cumple decide):
--   0. Colección de un plan → TW061 (se borra con el plan). Sin cambios.
--   1. Sin pareja activa (aún no se ha unido o ya se fue) → se borra al momento.
--   R1. Hay algún sitio en ella que añadió otra persona (collection_places.added_by distinto de quien borra, también
--       los sitios privados de la pareja y las filas sin autor) → pide aprobación (como hasta ahora). Cuenta aunque la
--       colección sea privada: así no se puede ocultar una colección con sitios de la pareja y borrarla sin permiso.
--   2. Privada (solo la ves tú) → se borra al momento.
--   3. Compartida, vacía y creada por ti → se borra al momento.
--   R2. Compartida en cualquier otro caso (con sitios solo tuyos, o creada por la pareja) → «dejarla»: desaparece para
--       ti y la pareja la conserva como colección privada suya:
--       - collections.created_by pasa a la pareja y visible_to_partner a false. Quien la dejó no la ve (RLS) y la
--         pareja puede volver a compartirla con «Visible para…» (ya es suya: TW013 no salta).
--       - Las filas de sitios que la pareja no ve (privados de quien la deja) se quitan de la colección; los sitios
--         siguen existiendo. Las demás pasan a added_by = pareja: la colección y lo que tiene son ya de la pareja, y si
--         después la borra ella no necesita permiso de quien ya la dejó.
--       - Colección principal: en los sitios que la tenían de principal y están en otra colección compartida, pasa a la
--         más antigua de esas; si no hay, se queda (la pareja la sigue teniendo; quien la dejó ve el icono de la
--         categoría, §8).
--       - Sus solicitudes de borrado pendientes se cancelan. Si la pendiente era de la pareja (quería borrarla), los
--         dos estáis de acuerdo: se borra para los dos.
--   Con aprobación (R1), aprobar sigue borrándola para los dos. Los sitios nunca se borran con una colección.
--
-- Carreras: request_deletion bloquea la colección (FOR UPDATE) antes de decidir, y decide en otra sentencia. Añadir un
-- sitio a la colección pide FOR KEY SHARE sobre ella (FK de collection_places), así que espera a que termine; si el alta
-- llegó antes, la decisión ya la ve. Dos peticiones a la vez sobre la misma colección se ejecutan una detrás de otra.
--
-- Supuestos a confirmar con David: (a) «dejar» también una compartida VACÍA creada por la pareja, pero borrar del todo
-- una compartida vacía creada por ti; (b) los sitios privados de quien la deja salen de la colección; (c) la principal
-- pasa a otra colección compartida del sitio si la tiene.
--
-- Contrato para la app (sin cambios de firma):
--   · Borrar: rpc('request_deletion', {p_id: <uuid nuevo>, p_type: 'collection', p_target_id: <colección>})
--       {status:'deleted'}                          → borrada para los dos.
--       {status:'deleted', request_id}              → borrada: la pareja ya había pedido borrarla.
--       {status:'deleted', kept_by_partner:true}    → «dejada»: desaparece para ti; {pareja} la conserva.
--                                                     La app la quita de su caché (collections y collection_places de
--                                                     esa colección): Realtime no avisa a quien deja de verla.
--       {status:'pending', request_id}              → pendiente de que {pareja} lo apruebe (§6).
--     Errores: TW001 (sin pareja), TW060 (no existe o no la ves), TW061 (de un plan).
--   · Editar: update collections set visible_to_partner = false en una compartida → TW054 (antes, TW013 si no es tuya).
--     Un cliente antiguo trata la «dejada» como borrada: compatible si la migración se aplica antes que la app.
--   · Saber antes de confirmar qué pasará (texto de la hoja): rpc('preview_collection_deletion', {p_collection_id})
--       → 'delete' | 'leave' | 'approval' | 'plan'. Errores TW001 y TW060. Es orientativo: la decisión final es la
--       de request_deletion (la pareja puede añadir un sitio entre medias).
--
-- Códigos: TW054 nuevo (una colección compartida no puede volver a ser privada desde la app; §1).
-- Requiere 20261122000000_borrar_cumple_etiqueta.sql (request_deletion parte de esa definición, idéntica salvo lo
-- marcado con [Colecciones]).
-- Idempotente. La parte A (cambios) va en su transacción y la parte B (pruebas) acaba en ROLLBACK.
-- Funciona entero en el SQL Editor o con `supabase db query --remote -f`.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Requisitos
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_proc
                 where oid = to_regprocedure('public.request_deletion(uuid, public.deletion_target, uuid, date)')
                   and prosrc like '%Cumpleaños de%') then
    raise exception 'Aplica antes 20261122000000_borrar_cumple_etiqueta.sql';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Guarda de collections: created_by solo lo cambia el servidor (traspaso al dejarla)
--    Igual que private.guard_owned_row salvo que en un UPDATE fuera del cliente no fija created_by.
--    Además (TW054, como TW053 en sitios): desde la app una compartida no vuelve a ser privada. La pareja la tiene en
--    su caché, Realtime no le avisaría y podría tener sitios suyos dentro. Solo el servidor la hace privada (al dejarla).
--    places y recurring_payments siguen con guard_owned_row.
-- -----------------------------------------------------------------------------
create or replace function private.collections_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if private.is_client_write() then new.created_by := auth.uid(); end if;
  elsif private.is_client_write() then
    new.created_by := old.created_by;
    if new.visible_to_partner is distinct from old.visible_to_partner
       and old.created_by is distinct from auth.uid() then
      raise exception 'Solo quien lo creó puede cambiar su visibilidad' using errcode = 'TW013';
    end if;
    if old.visible_to_partner and not new.visible_to_partner then
      raise exception 'Una colección compartida no puede volver a ser privada' using errcode = 'TW054';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists a_guard on public.collections;
create trigger a_guard before insert or update on public.collections
  for each row execute function private.collections_guard();

-- -----------------------------------------------------------------------------
-- 2. Qué pasa al borrar una colección: 'plan' | 'delete' | 'approval' | 'leave'
--    Sin permisos propios: la llaman request_deletion y preview_collection_deletion (security definer) después de
--    comprobar que la colección es de la pareja y quien llama la ve. Quien la llama tiene que haberla bloqueado antes
--    si va a actuar según el resultado.
-- -----------------------------------------------------------------------------
create or replace function private.collection_deletion_mode(p_collection_id uuid, p_uid uuid) returns text
language sql stable set search_path = '' as $$
  select case
    when c.plan_id is not null then 'plan'
    when private.active_member_count(c.couple_id) < 2 then 'delete'
    when exists (select 1 from public.collection_places cp
                 where cp.collection_id = c.id and cp.added_by is distinct from p_uid) then 'approval'
    when not c.visible_to_partner then 'delete'
    when c.created_by = p_uid
         and not exists (select 1 from public.collection_places cp where cp.collection_id = c.id) then 'delete'
    else 'leave'
  end
  from public.collections c
  where c.id = p_collection_id
$$;

-- -----------------------------------------------------------------------------
-- 3. Dejar una colección compartida: pasa a ser privada de la pareja (regla R2)
--    Sin permisos propios: solo la llama request_deletion, con la colección bloqueada y el modo 'leave'.
-- -----------------------------------------------------------------------------
create or replace function private.leave_collection(p_collection_id uuid, p_uid uuid) returns void
language plpgsql set search_path = '' as $$
declare
  v_couple  uuid;
  v_partner uuid;
begin
  select c.couple_id into v_couple from public.collections c where c.id = p_collection_id;
  select m.user_id into v_partner from public.couple_members m
  where m.couple_id = v_couple and m.user_id <> p_uid and m.left_at is null;
  if v_partner is null then
    raise exception 'No hay pareja a quien dejarle la colección' using errcode = 'TW001';
  end if;

  -- Los sitios que la pareja no ve (privados de quien la deja) salen de la colección; el sitio se queda.
  -- y_primary recoloca su principal si era esta.
  delete from public.collection_places cp
  using public.places p
  where cp.collection_id = p_collection_id and p.id = cp.place_id
    and not p.visible_to_partner and p.created_by is distinct from v_partner;

  -- Principal: si el sitio está en otra colección compartida (la ven los dos), pasa a la más antigua de ellas. Una
  -- privada de cualquiera de los dos no: le quitaría el icono a quien no la ve. Si no hay, se queda.
  update public.places p set primary_collection_id = (
    select cp.collection_id from public.collection_places cp
    join public.collections c on c.id = cp.collection_id
    where cp.place_id = p.id and cp.collection_id <> p_collection_id and c.visible_to_partner
    order by cp.added_at, cp.collection_id limit 1)
  where p.primary_collection_id = p_collection_id
    and exists (select 1 from public.collection_places cp
                join public.collections c on c.id = cp.collection_id
                where cp.place_id = p.id and cp.collection_id <> p_collection_id and c.visible_to_partner);

  -- La colección y lo que queda en ella pasan a la pareja, en privado.
  update public.collection_places set added_by = v_partner
  where collection_id = p_collection_id and added_by is distinct from v_partner;
  update public.collections set created_by = v_partner, visible_to_partner = false where id = p_collection_id;

  update public.deletion_requests set status = 'cancelled', decided_at = now()
  where target_type = 'collection' and target_id = p_collection_id and status = 'pending';
end $$;

-- -----------------------------------------------------------------------------
-- 4. request_deletion
--    Idéntica a 20261122000000_borrar_cumple_etiqueta.sql §1 salvo los bloques [Colecciones].
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
-- 5. Qué pasará si la borro (para el texto de la hoja de confirmación). Solo lectura.
-- -----------------------------------------------------------------------------
create or replace function public.preview_collection_deletion(p_collection_id uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_couple uuid := private.my_couple_id();
begin
  if v_couple is null then
    raise exception 'No perteneces a ninguna pareja' using errcode = 'TW001';
  end if;
  if not exists (select 1 from public.collections c
                 where c.id = p_collection_id and c.couple_id = v_couple
                   and (c.visible_to_partner or c.created_by = v_uid)) then
    raise exception 'No encontrado' using errcode = 'TW060';
  end if;
  return private.collection_deletion_mode(p_collection_id, v_uid);
end $$;

-- -----------------------------------------------------------------------------
-- 6. Permisos: las privadas y el trigger no se conceden a nadie
-- -----------------------------------------------------------------------------
revoke all on function private.collections_guard()                    from public, anon, authenticated;
revoke all on function private.collection_deletion_mode(uuid, uuid)    from public, anon, authenticated;
revoke all on function private.leave_collection(uuid, uuid)            from public, anon, authenticated;
revoke all on function public.request_deletion(uuid, public.deletion_target, uuid, date) from public, anon;
grant execute on function public.request_deletion(uuid, public.deletion_target, uuid, date) to authenticated;
revoke all on function public.preview_collection_deletion(uuid) from public, anon;
grant execute on function public.preview_collection_deletion(uuid) to authenticated;

-- PostgREST: que vea la RPC nueva.
notify pgrst, 'reload schema';

commit;

-- =============================================================================
-- PARTE B · Pruebas (no dejan nada: todo acaba en ROLLBACK). Ejecutar como postgres.
-- Si una prueba falla, el script se detiene con «FALLO: ...» y la parte A ya está aplicada.
-- Escrituras «de la app» con set local role authenticated y auth.uid() simulado con request.jwt.claims
-- (se aplican la RLS y los triggers); las comprobaciones, como postgres.
-- No cambia la estructura de ninguna tabla ni toca filas reales: solo una pareja y dos usuarios de prueba.
--   Ana (…0000000000e9, m1) y Beto (…0000000000ea, m2).
-- =============================================================================
begin;
set local idle_in_transaction_session_timeout = '60s';

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000e9', 'col-a@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000ea', 'col-b@prueba.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-0000000000e9', 'Ana'),
  ('00000000-0000-4000-8000-0000000000ea', 'Beto')
on conflict (id) do update set display_name = excluded.display_name;
insert into public.couples (id) values ('00000000-0000-4000-8000-0000000000f9');
insert into public.couple_settings (couple_id) values ('00000000-0000-4000-8000-0000000000f9') on conflict do nothing;
insert into public.couple_members (couple_id, user_id, slot) values
  ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000000e9', 'm1'),
  ('00000000-0000-4000-8000-0000000000f9', '00000000-0000-4000-8000-0000000000ea', 'm2');

-- Sitios de prueba: pA1, pA2 compartidos de Ana; pAp privado de Ana; pB1 compartido de Beto.
do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000f9';
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.places (id, couple_id, name, lat, lng, provider, visible_to_partner) values
    ('00000000-0000-4000-8000-000000009a01', v_c, 'Ramen Kaze', 40.41, -3.70, 'manual', true),
    ('00000000-0000-4000-8000-000000009a02', v_c, 'Shibuya Ramen', 40.42, -3.71, 'manual', true),
    ('00000000-0000-4000-8000-000000009a03', v_c, 'Sushi sorpresa', 40.43, -3.72, 'manual', false);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ea","role":"authenticated"}', true);
  insert into public.places (id, couple_id, name, lat, lng, provider, visible_to_partner) values
    ('00000000-0000-4000-8000-000000009b01', v_c, 'Café Brisa', 40.44, -3.73, 'manual', true);
  reset role;
end $$;

-- B1. Estructura y permisos
do $$
begin
  assert (select tgfoid = 'private.collections_guard()'::regprocedure::oid from pg_trigger
          where tgrelid = 'public.collections'::regclass and tgname = 'a_guard'),
         'FALLO: a_guard de collections no usa private.collections_guard';
  assert (select tgfoid = 'private.guard_owned_row()'::regprocedure::oid from pg_trigger
          where tgrelid = 'public.places'::regclass and tgname = 'a_guard'),
         'FALLO: a_guard de places ha cambiado';
  assert (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
          where oid = 'public.preview_collection_deletion(uuid)'::regprocedure),
         'FALLO: preview_collection_deletion debe ser security definer con search_path vacío';
  assert (select prosecdef and proconfig @> array['search_path=""'] from pg_proc
          where oid = 'public.request_deletion(uuid, public.deletion_target, uuid, date)'::regprocedure),
         'FALLO: request_deletion debe ser security definer con search_path vacío';
  assert has_function_privilege('authenticated', 'public.preview_collection_deletion(uuid)', 'execute'),
         'FALLO: authenticated no puede ejecutar preview_collection_deletion';
  assert not has_function_privilege('anon', 'public.preview_collection_deletion(uuid)', 'execute'),
         'FALLO: anon puede ejecutar preview_collection_deletion';
  assert not has_function_privilege('authenticated', 'private.leave_collection(uuid, uuid)', 'execute'),
         'FALLO: authenticated ejecuta private.leave_collection';
  assert not has_function_privilege('authenticated', 'private.collection_deletion_mode(uuid, uuid)', 'execute'),
         'FALLO: authenticated ejecuta private.collection_deletion_mode';
end $$;

-- B2. Sin permiso y borrada para los dos: privada; compartida vacía y tuya. Los sitios se quedan.
do $$
declare
  v_c     constant uuid := '00000000-0000-4000-8000-0000000000f9';
  v_priv  constant uuid := '00000000-0000-4000-8000-000000009c01';
  v_vacia constant uuid := '00000000-0000-4000-8000-000000009c02';
  v_r     jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.collections (id, couple_id, name, icon, visible_to_partner) values
    (v_priv, v_c, 'Mis sitios', '⭐', false),
    (v_vacia, v_c, 'Vacía', '🍕', true);
  insert into public.collection_places (collection_id, place_id, couple_id) values
    (v_priv, '00000000-0000-4000-8000-000000009a01', v_c);

  assert public.preview_collection_deletion(v_priv) = 'delete', 'FALLO: preview de una privada no es delete';
  v_r := public.request_deletion(gen_random_uuid(), 'collection', v_priv);
  assert v_r = '{"status":"deleted"}'::jsonb, 'FALLO: borrar una colección privada (' || v_r::text || ')';

  assert public.preview_collection_deletion(v_vacia) = 'delete', 'FALLO: preview de una compartida vacía tuya no es delete';
  v_r := public.request_deletion(gen_random_uuid(), 'collection', v_vacia);
  assert v_r = '{"status":"deleted"}'::jsonb, 'FALLO: borrar una compartida vacía tuya (' || v_r::text || ')';
  reset role;

  assert not exists (select 1 from public.collections where id in (v_priv, v_vacia)), 'FALLO: las colecciones no se borraron';
  assert exists (select 1 from public.places where id = '00000000-0000-4000-8000-000000009a01'), 'FALLO: se borró el sitio';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B3. R2: Ana deja una compartida con solo sitios suyos (uno privado). Beto la conserva y puede volver a compartirla.
do $$
declare
  v_c     constant uuid := '00000000-0000-4000-8000-0000000000f9';
  v_ana   constant uuid := '00000000-0000-4000-8000-0000000000e9';
  v_beto  constant uuid := '00000000-0000-4000-8000-0000000000ea';
  v_sushi constant uuid := '00000000-0000-4000-8000-000000009c11';
  v_otra  constant uuid := '00000000-0000-4000-8000-000000009c12';
  v_pa1   constant uuid := '00000000-0000-4000-8000-000000009a01';
  v_pa2   constant uuid := '00000000-0000-4000-8000-000000009a02';
  v_pap   constant uuid := '00000000-0000-4000-8000-000000009a03';
  v_r     jsonb;
  v_n     integer;
  v_ok    boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.collections (id, couple_id, name, icon, visible_to_partner) values
    (v_sushi, v_c, 'Sushi', '🍣', true),
    (v_otra, v_c, 'Otra', '🍜', true);
  insert into public.collection_places (collection_id, place_id, couple_id, added_at) values
    (v_sushi, v_pa1, v_c, now() - interval '3 minutes'),
    (v_sushi, v_pa2, v_c, now() - interval '3 minutes'),
    (v_sushi, v_pap, v_c, now() - interval '3 minutes'),
    (v_otra,  v_pa1, v_c, now() - interval '1 minute');
  reset role;
  assert (select primary_collection_id = v_sushi from public.places where id = v_pa1), 'FALLO: preparación (principal de pA1)';

  -- Beto ve sitios de Ana en ella: para él borrarla pediría permiso; para Ana, dejarla.
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ea","role":"authenticated"}', true);
  set local role authenticated;
  assert public.preview_collection_deletion(v_sushi) = 'approval', 'FALLO: preview de Beto no es approval';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  assert public.preview_collection_deletion(v_sushi) = 'leave', 'FALLO: preview de Ana no es leave';
  v_r := public.request_deletion(gen_random_uuid(), 'collection', v_sushi);
  assert v_r = '{"status":"deleted","kept_by_partner":true}'::jsonb, 'FALLO: Ana no la deja (' || v_r::text || ')';

  -- Ana ya no la ve, ni sus pertenencias
  select count(*) into v_n from public.collections where id = v_sushi;
  assert v_n = 0, 'FALLO: Ana sigue viendo la colección que dejó';
  select count(*) into v_n from public.collection_places where collection_id = v_sushi;
  assert v_n = 0, 'FALLO: Ana sigue viendo sitios de la colección que dejó';
  reset role;

  assert (select created_by = v_beto and not visible_to_partner from public.collections where id = v_sushi),
         'FALLO: la colección no pasó a ser privada de Beto';
  assert not exists (select 1 from public.collection_places where collection_id = v_sushi and place_id = v_pap),
         'FALLO: el sitio privado de Ana sigue en la colección de Beto';
  assert exists (select 1 from public.places where id = v_pap), 'FALLO: se borró el sitio privado de Ana';
  assert (select count(*) = 2 and bool_and(added_by = v_beto) from public.collection_places where collection_id = v_sushi),
         'FALLO: los sitios compartidos no pasaron a Beto';
  assert (select primary_collection_id = v_otra from public.places where id = v_pa1),
         'FALLO: la principal de pA1 no pasó a su otra colección';
  assert (select primary_collection_id = v_sushi from public.places where id = v_pa2),
         'FALLO: la principal de pA2 (sin otra colección) cambió';
  assert not exists (select 1 from public.deletion_requests where target_id = v_sushi), 'FALLO: dejarla creó una solicitud';

  -- Beto la ve con sus dos sitios, la vuelve a compartir (es suya: sin TW013) y Ana la ve otra vez
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ea","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into v_n from public.collection_places where collection_id = v_sushi;
  assert v_n = 2, 'FALLO: Beto ve ' || v_n || ' sitios en la colección (deben ser 2)';
  assert public.preview_collection_deletion(v_sushi) = 'delete', 'FALLO: preview de Beto en su privada no es delete';
  update public.collections set visible_to_partner = true where id = v_sushi;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  select count(*) into v_n from public.collections where id = v_sushi;
  assert v_n = 1, 'FALLO: Ana no ve la colección que Beto volvió a compartir';

  -- Vuelta a compartir, ya no puede volver a ser privada (TW054); los sitios son de Beto: Ana necesita su permiso
  assert public.preview_collection_deletion(v_sushi) = 'approval', 'FALLO: preview de Ana en la que Beto volvió a compartir';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ea","role":"authenticated"}', true);
  v_ok := false;
  begin
    update public.collections set visible_to_partner = false where id = v_sushi;
  exception when sqlstate 'TW054' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Beto vuelve privada una colección compartida';
  reset role;
  assert (select visible_to_partner from public.collections where id = v_sushi), 'FALLO: la colección dejó de ser compartida';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B4. R2 con una compartida de Beto (vacía, o con sitios solo de Ana): Ana la deja y Beto la conserva
do $$
declare
  v_c     constant uuid := '00000000-0000-4000-8000-0000000000f9';
  v_beto  constant uuid := '00000000-0000-4000-8000-0000000000ea';
  v_bv    constant uuid := '00000000-0000-4000-8000-000000009c21';  -- de Beto, vacía
  v_bs    constant uuid := '00000000-0000-4000-8000-000000009c22';  -- de Beto, con sitios de Ana
  v_ap    constant uuid := '00000000-0000-4000-8000-000000009c23';  -- privada de Ana
  v_pa4   constant uuid := '00000000-0000-4000-8000-000000009a04';  -- compartido de Ana: principal Cafés y en v_ap
  v_r     jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ea","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.collections (id, couple_id, name, icon, visible_to_partner) values
    (v_bv, v_c, 'Japón', '🗾', true),
    (v_bs, v_c, 'Cafés', '☕', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  insert into public.places (id, couple_id, name, lat, lng, provider, visible_to_partner) values
    (v_pa4, v_c, 'Café Lento', 40.45, -3.74, 'manual', true);
  insert into public.collections (id, couple_id, name, icon, visible_to_partner) values (v_ap, v_c, 'Mía', '🔒', false);
  insert into public.collection_places (collection_id, place_id, couple_id, added_at) values
    (v_bs, '00000000-0000-4000-8000-000000009a02', v_c, now() - interval '2 minutes'),
    (v_bs, v_pa4, v_c, now() - interval '2 minutes'),
    (v_ap, v_pa4, v_c, now() - interval '1 minute');
  assert public.preview_collection_deletion(v_bv) = 'leave', 'FALLO: preview de una vacía de la pareja no es leave';
  v_r := public.request_deletion(gen_random_uuid(), 'collection', v_bv);
  assert v_r ->> 'kept_by_partner' = 'true', 'FALLO: Ana borra del todo una vacía de Beto (' || v_r::text || ')';
  v_r := public.request_deletion(gen_random_uuid(), 'collection', v_bs);
  assert v_r ->> 'kept_by_partner' = 'true', 'FALLO: Ana borra del todo una de Beto con sitios suyos (' || v_r::text || ')';
  reset role;
  assert (select count(*) = 2 and bool_and(created_by = v_beto and not visible_to_partner)
          from public.collections where id in (v_bv, v_bs)), 'FALLO: Beto no conserva sus colecciones';
  assert (select count(*) = 2 and bool_and(added_by = v_beto) from public.collection_places where collection_id = v_bs),
         'FALLO: los sitios no pasaron a Beto';
  assert (select primary_collection_id = v_bs from public.places where id = v_pa4),
         'FALLO: la principal pasó a una colección privada de Ana';

  -- Beto borra la que heredó (privada, sitios suyos): sin permiso; los sitios se quedan
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ea","role":"authenticated"}', true);
  set local role authenticated;
  v_r := public.request_deletion(gen_random_uuid(), 'collection', v_bs);
  assert v_r = '{"status":"deleted"}'::jsonb, 'FALLO: Beto no puede borrar la colección que heredó (' || v_r::text || ')';
  reset role;
  assert not exists (select 1 from public.collections where id = v_bs), 'FALLO: la colección heredada no se borró';
  assert (select count(*) = 2 from public.places where id in ('00000000-0000-4000-8000-000000009a02', v_pa4)),
         'FALLO: se borraron sitios';
  assert (select primary_collection_id = v_ap from public.places where id = v_pa4),
         'FALLO: la principal de pA4 no pasó a la colección que le queda';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B5. R1: con un sitio de la pareja pide permiso; la pareja lo aprueba y se borra para los dos
do $$
declare
  v_c    constant uuid := '00000000-0000-4000-8000-0000000000f9';
  v_cena constant uuid := '00000000-0000-4000-8000-000000009c31';
  v_r1   constant uuid := '00000000-0000-4000-8000-000000009d31';
  v_r    jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.collections (id, couple_id, name, icon, visible_to_partner) values (v_cena, v_c, 'Cenas', '🍷', true);
  insert into public.collection_places (collection_id, place_id, couple_id) values
    (v_cena, '00000000-0000-4000-8000-000000009a01', v_c);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ea","role":"authenticated"}', true);
  insert into public.collection_places (collection_id, place_id, couple_id) values
    (v_cena, '00000000-0000-4000-8000-000000009b01', v_c);

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  assert public.preview_collection_deletion(v_cena) = 'approval', 'FALLO: preview con sitios de la pareja no es approval';
  v_r := public.request_deletion(v_r1, 'collection', v_cena);
  assert v_r ->> 'status' = 'pending', 'FALLO: con sitios de la pareja no pide permiso (' || v_r::text || ')';
  v_r := public.request_deletion(gen_random_uuid(), 'collection', v_cena);
  assert v_r ->> 'status' = 'pending' and (v_r ->> 'request_id')::uuid = v_r1, 'FALLO: repetir la petición (' || v_r::text || ')';

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ea","role":"authenticated"}', true);
  perform public.respond_deletion(v_r1, true);
  reset role;
  assert not exists (select 1 from public.collections where id = v_cena), 'FALLO: aprobada y no se borró';
  assert (select count(*) = 2 from public.places
          where id in ('00000000-0000-4000-8000-000000009a01', '00000000-0000-4000-8000-000000009b01')),
         'FALLO: al borrar la colección se borraron sitios';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B6. Quien la creó no puede ocultarla (TW054) y con sitios de la pareja borrarla sigue pidiendo permiso
do $$
declare
  v_c  constant uuid := '00000000-0000-4000-8000-0000000000f9';
  v_x  constant uuid := '00000000-0000-4000-8000-000000009c41';
  v_r  jsonb;
  v_ok boolean := false;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.collections (id, couple_id, name, icon, visible_to_partner) values (v_x, v_c, 'Bares', '🍺', true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ea","role":"authenticated"}', true);
  insert into public.collection_places (collection_id, place_id, couple_id) values
    (v_x, '00000000-0000-4000-8000-000000009b01', v_c);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  begin
    update public.collections set visible_to_partner = false where id = v_x;
  exception when sqlstate 'TW054' then v_ok := true;
  end;
  assert v_ok, 'FALLO: quien la creó vuelve privada una colección compartida';
  v_r := public.request_deletion(gen_random_uuid(), 'collection', v_x);
  assert v_r ->> 'status' = 'pending', 'FALLO: con sitios de la pareja no pide permiso (' || v_r::text || ')';
  reset role;
  assert (select visible_to_partner from public.collections where id = v_x), 'FALLO: la colección dejó de ser compartida';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B7. Los dos quieren borrarla: Beto lo pidió (había sitios de Ana) y Ana, sin sitios de Beto, la borra → para los dos
do $$
declare
  v_c  constant uuid := '00000000-0000-4000-8000-0000000000f9';
  v_y  constant uuid := '00000000-0000-4000-8000-000000009c51';
  v_rb constant uuid := '00000000-0000-4000-8000-000000009d51';
  v_r  jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.collections (id, couple_id, name, icon, visible_to_partner) values (v_y, v_c, 'Terrazas', '🌳', true);
  insert into public.collection_places (collection_id, place_id, couple_id) values
    (v_y, '00000000-0000-4000-8000-000000009a01', v_c);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ea","role":"authenticated"}', true);
  v_r := public.request_deletion(v_rb, 'collection', v_y);
  assert v_r ->> 'status' = 'pending', 'FALLO: Beto debía pedir permiso (' || v_r::text || ')';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  v_r := public.request_deletion(gen_random_uuid(), 'collection', v_y);
  assert v_r ->> 'status' = 'deleted' and v_r ->> 'kept_by_partner' is null and (v_r ->> 'request_id')::uuid = v_rb,
         'FALLO: con los dos de acuerdo no se borra para los dos (' || v_r::text || ')';
  reset role;
  assert not exists (select 1 from public.collections where id = v_y), 'FALLO: la colección sigue';
  assert (select status = 'approved' from public.deletion_requests where id = v_rb), 'FALLO: la solicitud de Beto no quedó aprobada';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B8. Dejarla cancela la solicitud propia que ya no hace falta (la pareja quitó sus sitios)
do $$
declare
  v_c  constant uuid := '00000000-0000-4000-8000-0000000000f9';
  v_z  constant uuid := '00000000-0000-4000-8000-000000009c61';
  v_ra constant uuid := '00000000-0000-4000-8000-000000009d61';
  v_r  jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.collections (id, couple_id, name, icon, visible_to_partner) values (v_z, v_c, 'Brunch', '🥞', true);
  insert into public.collection_places (collection_id, place_id, couple_id) values
    (v_z, '00000000-0000-4000-8000-000000009a02', v_c);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ea","role":"authenticated"}', true);
  insert into public.collection_places (collection_id, place_id, couple_id) values
    (v_z, '00000000-0000-4000-8000-000000009b01', v_c);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  v_r := public.request_deletion(v_ra, 'collection', v_z);
  assert v_r ->> 'status' = 'pending', 'FALLO: preparación (debía pedir permiso)';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ea","role":"authenticated"}', true);
  delete from public.collection_places where collection_id = v_z and place_id = '00000000-0000-4000-8000-000000009b01';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  v_r := public.request_deletion(gen_random_uuid(), 'collection', v_z);
  assert v_r ->> 'kept_by_partner' = 'true', 'FALLO: sin sitios de Beto no la deja (' || v_r::text || ')';
  reset role;
  assert (select status = 'cancelled' from public.deletion_requests where id = v_ra), 'FALLO: la solicitud vieja sigue pendiente';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B9. Colección de un plan (TW061), guardas del cliente (created_by, TW013) y colección que no ves (TW060)
do $$
declare
  v_c    constant uuid := '00000000-0000-4000-8000-0000000000f9';
  v_beto constant uuid := '00000000-0000-4000-8000-0000000000ea';
  v_plan constant uuid := '00000000-0000-4000-8000-000000009e01';
  v_bc   constant uuid := '00000000-0000-4000-8000-000000009c71';  -- compartida de Beto
  v_bp   constant uuid := '00000000-0000-4000-8000-000000009c72';  -- privada de Beto
  v_pc   uuid;
  v_ok   boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.plans (id, couple_id, type, name, icon, start_date, end_date)
  values (v_plan, v_c, 'trip', 'Lisboa', '✈️', '2030-06-01', '2030-06-04');
  select id into v_pc from public.collections where plan_id = v_plan;
  assert public.preview_collection_deletion(v_pc) = 'plan', 'FALLO: preview de la colección de un plan no es plan';
  v_ok := false;
  begin
    perform public.request_deletion(gen_random_uuid(), 'collection', v_pc);
  exception when sqlstate 'TW061' then v_ok := true;
  end;
  assert v_ok, 'FALLO: borrar la colección de un plan no da TW061';

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ea","role":"authenticated"}', true);
  insert into public.collections (id, couple_id, name, icon, visible_to_partner) values
    (v_bc, v_c, 'Museos', '🎭', true),
    (v_bp, v_c, 'Regalos', '🛍️', false);

  -- Ana no puede cambiar la visibilidad de una colección de Beto (TW013) ni quedársela cambiando created_by
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e9","role":"authenticated"}', true);
  v_ok := false;
  begin
    update public.collections set visible_to_partner = false where id = v_bc;
  exception when sqlstate 'TW013' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Ana cambia la visibilidad de una colección de Beto';
  update public.collections set created_by = '00000000-0000-4000-8000-0000000000e9', name = 'Museos!' where id = v_bc;

  -- La privada de Beto no existe para Ana (TW060), ni en la vista previa ni al borrarla
  v_ok := false;
  begin
    perform public.preview_collection_deletion(v_bp);
  exception when sqlstate 'TW060' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Ana consulta una colección privada de Beto';
  v_ok := false;
  begin
    perform public.request_deletion(gen_random_uuid(), 'collection', v_bp);
  exception when sqlstate 'TW060' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Ana borra una colección privada de Beto';
  reset role;

  assert (select created_by = v_beto and name = 'Museos!' from public.collections where id = v_bc),
         'FALLO: el cliente pudo cambiar created_by';
  assert exists (select 1 from public.collections where id = v_pc), 'FALLO: se borró la colección del plan';
  assert exists (select 1 from public.collections where id = v_bp), 'FALLO: se borró la privada de Beto';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B10. Final
do $$
begin
  raise notice 'PRUEBAS DE COLECCIONES (borrado): todas correctas';
end $$;

rollback;
