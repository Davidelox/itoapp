-- =============================================================================
-- ito · Avisos push, fase 4: acciones de la pareja (docs/plan-avisos-push.md §4.2)
--
-- Qué hace: triggers AFTER que avisan a la otra persona (cola push_outbox, private.enqueue_push) cuando:
--   1. deletion_requests (insert pending)  → «Ana quiere borrar «Cena»»           (notify_requests)
--   2. settings_proposals (insert pending) → «Ana propone cambiar los ajustes»    (notify_requests)
--   3. settlements (insert pending)        → a quien recibe: «Ana dice que te ha pagado 40 €. ¿Lo confirmas?»
--      settlements (pending → confirmed/rejected) → a quien la registró: «Beto ha confirmado tu pago de 40 €»
--                                                                                   (notify_settlements)
--   4. expenses (insert)                   → «Ana ha añadido Súper · 54,20 €»     (notify_partner_expense)
--
-- Reglas:
--   - Un fallo de avisos NUNCA rompe la operación original: cada función atrapa todo (when others → warning).
--   - Solo si auth.uid() no es nulo: lo que crea el job diario o el cron (sin sesión) no avisa.
--   - Nunca se avisa a quien ejecuta la acción (el destinatario es siempre otro miembro activo).
--   - Preferencias: las comprueba private.enqueue_push (miembro activo + columna notify_*).
--   - Gastos: solo los visibles para la pareja y que le afectan (no los personales de quien los crea, ni los que
--     genera un cobro recurrente, que ya se avisan antes con «Cobro próximo»).
--   - Secretos: ningún texto lleva el título de un evento. Una petición de borrar un evento secreto no existe
--     (se borra sin aprobación); si aun así hubiera una, no se avisa.
--   - dedupe_key única global y termina en :<user_id> (decisión de la fase 3).
--   - Las funciones de trigger son SECURITY DEFINER con search_path vacío (leen profiles y couple_members sin
--     RLS y usan private.enqueue_push y private.format_money, que no se conceden a authenticated).
--
-- Requiere 20261123000000_avisos_base.sql y 20261124000000_avisos_programados.sql.
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
  if to_regprocedure('private.format_money(integer, text)') is null then
    raise exception 'Aplica antes 20261124000000_avisos_programados.sql';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Pedir borrar algo
-- -----------------------------------------------------------------------------
create or replace function private.aviso_borrado() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_name  text;
  v_to    uuid;
begin
  begin
    v_actor := auth.uid();  -- dentro del bloque protegido: si falla, tampoco rompe la operación
    if v_actor is null or new.status <> 'pending' then
      return null;
    end if;
    -- Un evento secreto nunca se pide borrar (se borra sin aprobación); por si acaso, sin aviso.
    if new.target_type = 'event'
       and exists (select 1 from public.events e where e.id = new.target_id and e.is_secret) then
      return null;
    end if;

    select coalesce(nullif(btrim(p.display_name), ''), 'Tu pareja') into v_name
    from public.profiles p where p.id = v_actor;
    v_name := coalesce(v_name, 'Tu pareja');

    for v_to in
      select m.user_id from public.couple_members m
      where m.couple_id = new.couple_id and m.left_at is null and m.user_id <> v_actor
    loop
      perform private.enqueue_push(v_to, new.couple_id, 'deletion_request', 'deletion:' || new.id || ':' || v_to,
                                   'Petición de borrado', v_name || ' quiere borrar «' || new.target_label || '»',
                                   '/', 'notify_requests');
    end loop;
  exception when others then
    raise warning 'aviso_borrado: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists y_aviso on public.deletion_requests;
create trigger y_aviso after insert on public.deletion_requests
  for each row execute function private.aviso_borrado();

-- -----------------------------------------------------------------------------
-- 2. Proponer cambiar los ajustes
-- -----------------------------------------------------------------------------
create or replace function private.aviso_propuesta() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid;
  v_name  text;
  v_to    uuid;
begin
  begin
    v_actor := auth.uid();  -- dentro del bloque protegido: si falla, tampoco rompe la operación
    if v_actor is null or new.status <> 'pending' then
      return null;
    end if;

    select coalesce(nullif(btrim(p.display_name), ''), 'Tu pareja') into v_name
    from public.profiles p where p.id = v_actor;
    v_name := coalesce(v_name, 'Tu pareja');

    for v_to in
      select m.user_id from public.couple_members m
      where m.couple_id = new.couple_id and m.left_at is null and m.user_id <> v_actor
    loop
      perform private.enqueue_push(v_to, new.couple_id, 'settings_proposal', 'proposal:' || new.id || ':' || v_to,
                                   'Propuesta de ajustes', v_name || ' propone cambiar los ajustes',
                                   '/', 'notify_requests');
    end loop;
  exception when others then
    raise warning 'aviso_propuesta: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists y_aviso on public.settings_proposals;
create trigger y_aviso after insert on public.settings_proposals
  for each row execute function private.aviso_propuesta();

-- -----------------------------------------------------------------------------
-- 3. Liquidaciones: te piden confirmar un pago / confirman o rechazan el tuyo
-- -----------------------------------------------------------------------------
create or replace function private.aviso_pago() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor    uuid;
  v_name     text;
  v_currency text;
  v_money    text;
  v_to       uuid;
begin
  begin
    v_actor := auth.uid();  -- dentro del bloque protegido: si falla, tampoco rompe la operación
    if v_actor is null then
      return null;
    end if;

    select coalesce(nullif(btrim(p.display_name), ''), 'Tu pareja') into v_name
    from public.profiles p where p.id = v_actor;
    v_name := coalesce(v_name, 'Tu pareja');
    select c.currency::text into v_currency from public.couples c where c.id = new.couple_id;
    v_money := private.format_money(new.amount_cents, coalesce(v_currency, 'EUR'));

    if tg_op = 'INSERT' then
      -- Solo un pago pendiente se avisa (uno ya confirmado lo registra quien lo recibe: no hay nada que confirmar).
      if new.status <> 'pending' then
        return null;
      end if;
      for v_to in
        select m.user_id from public.couple_members m
        where m.couple_id = new.couple_id and m.left_at is null and m.slot = new.to_slot and m.user_id <> v_actor
      loop
        perform private.enqueue_push(v_to, new.couple_id, 'settlement', 'settlement:' || new.id || ':' || v_to,
                                     'Confirma un pago', v_name || ' dice que te ha pagado ' || v_money || '. ¿Lo confirmas?',
                                     '/gastos/pago/' || new.id, 'notify_settlements');
      end loop;
    else
      -- pending → confirmed / rejected: se avisa a quien registró el pago (si no es quien responde).
      if old.status = 'pending' and new.status in ('confirmed', 'rejected')
         and new.created_by is not null and new.created_by <> v_actor then
        perform private.enqueue_push(new.created_by, new.couple_id, 'settlement',
                                     'settlement:' || new.id || ':' || new.status || ':' || new.created_by,
                                     case new.status when 'confirmed' then 'Pago confirmado' else 'Pago rechazado' end,
                                     v_name || case new.status when 'confirmed' then ' ha confirmado' else ' ha rechazado' end
                                       || ' tu pago de ' || v_money,
                                     '/gastos/pago/' || new.id, 'notify_settlements');
      end if;
    end if;
  exception when others then
    raise warning 'aviso_pago: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists y_aviso_alta on public.settlements;
create trigger y_aviso_alta after insert on public.settlements
  for each row execute function private.aviso_pago();
drop trigger if exists y_aviso_resp on public.settlements;
create trigger y_aviso_resp after update of status on public.settlements
  for each row when (old.status is distinct from new.status) execute function private.aviso_pago();

-- -----------------------------------------------------------------------------
-- 4. Gasto nuevo de la pareja
--    Solo si es visible para la pareja, no viene de un cobro recurrente y a la otra persona le afecta
--    (le toca una parte, la paga ella o interviene el bote). Un gasto personal visible no avisa.
-- -----------------------------------------------------------------------------
create or replace function private.aviso_gasto() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor    uuid;
  v_name     text;
  v_currency text;
  r          record;
begin
  begin
    v_actor := auth.uid();  -- dentro del bloque protegido: si falla, tampoco rompe la operación
    if v_actor is null or new.created_by is distinct from v_actor then
      return null;
    end if;

    select coalesce(nullif(btrim(p.display_name), ''), 'Tu pareja') into v_name
    from public.profiles p where p.id = v_actor;
    v_name := coalesce(v_name, 'Tu pareja');

    for r in
      select m.user_id, m.slot from public.couple_members m
      where m.couple_id = new.couple_id and m.left_at is null and m.user_id <> v_actor
    loop
      if (case r.slot when 'm1' then new.share_m1_cents when 'm2' then new.share_m2_cents else 0 end) > 0
         or new.share_pot_cents > 0
         or new.paid_by::text in (r.slot::text, 'pot') then
        perform private.enqueue_push(r.user_id, new.couple_id, 'partner_expense', 'expense:' || new.id || ':' || r.user_id,
                                     'Gasto nuevo',
                                     v_name || ' ha añadido ' || new.concept || ' · ' || private.format_money(new.amount_cents, new.currency::text),
                                     '/gastos/' || new.id, 'notify_partner_expense');
      end if;
    end loop;
  exception when others then
    raise warning 'aviso_gasto: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists y_aviso on public.expenses;
create trigger y_aviso after insert on public.expenses
  for each row when (new.visible_to_partner and new.recurring_occurrence_id is null)
  execute function private.aviso_gasto();

-- -----------------------------------------------------------------------------
-- 5. Permisos explícitos: las funciones de trigger no se conceden a nadie
--    (los triggers no comprueban EXECUTE al dispararse).
-- -----------------------------------------------------------------------------
revoke all on function private.aviso_borrado()   from public, anon, authenticated;
revoke all on function private.aviso_propuesta() from public, anon, authenticated;
revoke all on function private.aviso_pago()      from public, anon, authenticated;
revoke all on function private.aviso_gasto()     from public, anon, authenticated;

commit;

-- =============================================================================
-- PARTE B · Pruebas (no dejan nada: todo acaba en ROLLBACK). Ejecutar en el SQL Editor como postgres.
-- Si una prueba falla, el script se detiene con «FALLO: ...» y la parte A ya está aplicada.
-- auth.uid() se simula con request.jwt.claims; '{}' = sin sesión (como el job diario).
-- No cambia la estructura de ninguna tabla ni toca filas reales: solo una pareja y dos usuarios de prueba.
-- =============================================================================
begin;
set local idle_in_transaction_session_timeout = '60s';

create function pg_temp.n_avisos(p_key text, p_user uuid default null) returns integer
language sql as $$
  select count(*)::integer from public.push_outbox where dedupe_key like p_key and (p_user is null or user_id = p_user)
$$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'avisos-a@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'avisos-b@prueba.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-0000000000a1', 'Ana'),
  ('00000000-0000-4000-8000-0000000000a2', 'Beto')
on conflict (id) do update set display_name = excluded.display_name;
insert into public.couples (id) values ('00000000-0000-4000-8000-0000000000c1');
insert into public.couple_settings (couple_id) values ('00000000-0000-4000-8000-0000000000c1') on conflict do nothing;
insert into public.couple_members (couple_id, user_id, slot) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'm1'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a2', 'm2');

-- B1. Permisos y definición de las funciones de trigger
do $$
declare
  f text;
begin
  foreach f in array array['private.aviso_borrado()', 'private.aviso_propuesta()', 'private.aviso_pago()', 'private.aviso_gasto()'] loop
    assert not has_function_privilege('authenticated', f, 'execute'), 'FALLO: authenticated ejecuta ' || f;
    assert not has_function_privilege('anon', f, 'execute'), 'FALLO: anon ejecuta ' || f;
    assert (select prosecdef from pg_proc where oid = f::regprocedure), 'FALLO: ' || f || ' debe ser security definer';
    assert (select 'search_path=""' = any (proconfig) from pg_proc where oid = f::regprocedure), 'FALLO: ' || f || ' sin search_path vacío';
  end loop;
  assert (select count(*) from pg_trigger where not tgisinternal and tgname in ('y_aviso', 'y_aviso_alta', 'y_aviso_resp')
            and tgrelid in ('public.deletion_requests'::regclass, 'public.settings_proposals'::regclass,
                            'public.settlements'::regclass, 'public.expenses'::regclass)) = 5, 'FALLO: faltan triggers de avisos';
end $$;

-- B2. Pedir borrar: aviso al otro, no a quien pide; sin sesión no avisa; preferencia; secreto
do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000c1';
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_b constant uuid := '00000000-0000-4000-8000-0000000000a2';
  v_d1 uuid := gen_random_uuid(); v_d2 uuid := gen_random_uuid(); v_d3 uuid := gen_random_uuid();
  v_d4 uuid := gen_random_uuid(); v_d5 uuid := gen_random_uuid();
  v_ev uuid;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  insert into public.deletion_requests (id, couple_id, target_type, target_id, target_label, requested_by)
  values (v_d1, v_c, 'expense', gen_random_uuid(), 'Cena en Taberna', v_a);
  assert pg_temp.n_avisos('deletion:' || v_d1 || ':%', v_b) = 1, 'FALLO: no avisa de la petición de borrado a la pareja';
  assert pg_temp.n_avisos('deletion:' || v_d1 || ':%', v_a) = 0, 'FALLO: avisa a quien pide borrar';
  assert (select title || ' | ' || body || ' | ' || kind || ' | ' || url || ' | ' || dedupe_key from public.push_outbox
          where dedupe_key like 'deletion:' || v_d1 || ':%') = 'Petición de borrado | Ana quiere borrar «Cena en Taberna» | deletion_request | / | deletion:' || v_d1 || ':' || v_b,
         'FALLO: texto o clave de la petición de borrado';

  -- ya resuelta al insertar: no avisa
  insert into public.deletion_requests (id, couple_id, target_type, target_id, target_label, requested_by, status, decided_by, decided_at)
  values (v_d2, v_c, 'expense', gen_random_uuid(), 'Algo', v_a, 'approved', v_b, now());
  assert pg_temp.n_avisos('deletion:' || v_d2 || ':%') = 0, 'FALLO: avisa de una petición que no está pendiente';

  -- sin sesión (job diario / cron): no avisa
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.deletion_requests (id, couple_id, target_type, target_id, target_label, requested_by)
  values (v_d3, v_c, 'expense', gen_random_uuid(), 'Sin sesión', v_a);
  assert pg_temp.n_avisos('deletion:' || v_d3 || ':%') = 0, 'FALLO: avisa sin sesión';

  -- preferencia desactivada
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  update public.couple_members set notify_requests = false where user_id = v_b;
  insert into public.deletion_requests (id, couple_id, target_type, target_id, target_label, requested_by)
  values (v_d4, v_c, 'expense', gen_random_uuid(), 'Sin preferencia', v_a);
  assert pg_temp.n_avisos('deletion:' || v_d4 || ':%') = 0, 'FALLO: avisa con notify_requests desactivado';
  update public.couple_members set notify_requests = true where user_id = v_b;

  -- evento secreto: nada para la pareja
  insert into public.events (couple_id, title, start_date, is_secret, created_by)
  values (v_c, 'Sorpresa para Beto', '2030-07-01', true, v_a) returning id into v_ev;
  insert into public.deletion_requests (id, couple_id, target_type, target_id, target_label, requested_by)
  values (v_d5, v_c, 'event', v_ev, 'Sorpresa para Beto', v_a);
  assert pg_temp.n_avisos('deletion:' || v_d5 || ':%') = 0, 'FALLO: avisa de borrar un evento secreto';
  assert not exists (select 1 from public.push_outbox where user_id = v_b and (title like '%Sorpresa%' or body like '%Sorpresa%')),
         'FALLO: el título de un evento secreto llegó a la cola de la pareja';
end $$;

-- B3. Propuesta de ajustes
do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000c1';
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_b constant uuid := '00000000-0000-4000-8000-0000000000a2';
  v_p uuid;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
  insert into public.settings_proposals (couple_id, proposed_by, changes)
  values (v_c, v_b, '{"proportional_pct_m1": 60}'::jsonb) returning id into v_p;
  assert pg_temp.n_avisos('proposal:' || v_p || ':%', v_a) = 1, 'FALLO: no avisa de la propuesta de ajustes';
  assert pg_temp.n_avisos('proposal:' || v_p || ':%', v_b) = 0, 'FALLO: avisa a quien propone';
  assert (select title || ' | ' || body || ' | ' || kind || ' | ' || dedupe_key from public.push_outbox where dedupe_key like 'proposal:' || v_p || ':%')
         = 'Propuesta de ajustes | Beto propone cambiar los ajustes | settings_proposal | proposal:' || v_p || ':' || v_a,
         'FALLO: texto o clave de la propuesta';
  delete from public.settings_proposals where id = v_p;

  perform set_config('request.jwt.claims', '{}', true);
  insert into public.settings_proposals (couple_id, proposed_by, changes)
  values (v_c, v_b, '{"proportional_pct_m1": 60}'::jsonb) returning id into v_p;
  assert pg_temp.n_avisos('proposal:' || v_p || ':%') = 0, 'FALLO: avisa de una propuesta sin sesión';
end $$;

-- B4. Liquidaciones
do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000c1';
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_b constant uuid := '00000000-0000-4000-8000-0000000000a2';
  v_s1 uuid := gen_random_uuid(); v_s2 uuid := gen_random_uuid();
  v_s3 uuid := gen_random_uuid(); v_s4 uuid := gen_random_uuid();
begin
  -- Ana (m1) registra que ha pagado 40 € a Beto (m2): se avisa a Beto
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  insert into public.settlements (id, couple_id, from_slot, to_slot, amount_cents, method, created_by)
  values (v_s1, v_c, 'm1', 'm2', 4000, 'cash', v_a);
  assert pg_temp.n_avisos('settlement:' || v_s1 || ':%', v_b) = 1 and pg_temp.n_avisos('settlement:' || v_s1 || ':%', v_a) = 0,
         'FALLO: el pago pendiente debe avisar solo a quien lo recibe';
  assert (select title || ' | ' || body || ' | ' || kind || ' | ' || url || ' | ' || dedupe_key from public.push_outbox
          where dedupe_key like 'settlement:' || v_s1 || ':%' and user_id = v_b)
         = 'Confirma un pago | Ana dice que te ha pagado 40 €. ¿Lo confirmas? | settlement | /gastos/pago/' || v_s1 || ' | settlement:' || v_s1 || ':' || v_b,
         'FALLO: texto o clave del pago pendiente';

  -- Beto confirma: se avisa a Ana, no a Beto
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
  update public.settlements set status = 'confirmed', responded_by = v_b, responded_at = now() where id = v_s1;
  assert pg_temp.n_avisos('settlement:' || v_s1 || ':confirmed:%', v_a) = 1 and pg_temp.n_avisos('settlement:' || v_s1 || ':confirmed:%', v_b) = 0,
         'FALLO: la confirmación debe avisar solo a quien registró el pago';
  assert (select title || ' | ' || body from public.push_outbox where dedupe_key = 'settlement:' || v_s1 || ':confirmed:' || v_a)
         = 'Pago confirmado | Beto ha confirmado tu pago de 40 €', 'FALLO: texto de la confirmación';

  -- Otro pago de 12,50 € que Beto rechaza
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  insert into public.settlements (id, couple_id, from_slot, to_slot, amount_cents, method, created_by)
  values (v_s2, v_c, 'm1', 'm2', 1250, 'bizum', v_a);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
  update public.settlements set status = 'rejected', responded_by = v_b, responded_at = now() where id = v_s2;
  assert (select title || ' | ' || body from public.push_outbox where dedupe_key = 'settlement:' || v_s2 || ':rejected:' || v_a)
         = 'Pago rechazado | Beto ha rechazado tu pago de 12,50 €', 'FALLO: texto del rechazo';

  -- Un pago que se registra ya confirmado (lo anota quien recibe) no avisa
  insert into public.settlements (id, couple_id, from_slot, to_slot, amount_cents, method, status, created_by, responded_by, responded_at)
  values (v_s3, v_c, 'm1', 'm2', 500, 'cash', 'confirmed', v_b, v_b, now());
  assert pg_temp.n_avisos('settlement:' || v_s3 || ':%') = 0, 'FALLO: avisa de un pago registrado ya confirmado';

  -- Sin sesión: no avisa
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.settlements (id, couple_id, from_slot, to_slot, amount_cents, method, created_by)
  values (v_s4, v_c, 'm1', 'm2', 700, 'cash', v_a);
  assert pg_temp.n_avisos('settlement:' || v_s4 || ':%') = 0, 'FALLO: avisa de un pago sin sesión';

  -- Preferencia de liquidaciones desactivada en quien recibe
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  update public.couple_members set notify_settlements = false where user_id = v_b;
  v_s4 := gen_random_uuid();
  insert into public.settlements (id, couple_id, from_slot, to_slot, amount_cents, method, created_by)
  values (v_s4, v_c, 'm1', 'm2', 900, 'cash', v_a);
  assert pg_temp.n_avisos('settlement:' || v_s4 || ':%') = 0, 'FALLO: avisa con notify_settlements desactivado';
  update public.couple_members set notify_settlements = true where user_id = v_b;
end $$;

-- B5. Gastos
do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000c1';
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_b constant uuid := '00000000-0000-4000-8000-0000000000a2';
  v_e1 uuid := gen_random_uuid(); v_e2 uuid := gen_random_uuid(); v_e3 uuid := gen_random_uuid();
  v_e4 uuid := gen_random_uuid(); v_e5 uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

  -- compartido a medias, visible: avisa a Beto
  insert into public.expenses (id, couple_id, created_by, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner)
  values (v_e1, v_c, v_a, 'Súper', 5420, 'groceries', current_date, 'm1', 'half', true);
  assert pg_temp.n_avisos('expense:' || v_e1 || ':%', v_b) = 1 and pg_temp.n_avisos('expense:' || v_e1 || ':%', v_a) = 0,
         'FALLO: el gasto compartido debe avisar solo a la pareja';
  assert (select title || ' | ' || body || ' | ' || kind || ' | ' || url || ' | ' || dedupe_key from public.push_outbox
          where dedupe_key like 'expense:' || v_e1 || ':%')
         = 'Gasto nuevo | Ana ha añadido Súper · 54,20 € | partner_expense | /gastos/' || v_e1 || ' | expense:' || v_e1 || ':' || v_b,
         'FALLO: texto o clave del gasto';

  -- privado (no visible): nada
  insert into public.expenses (id, couple_id, created_by, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner)
  values (v_e2, v_c, v_a, 'Regalo secreto', 3000, 'leisure', current_date, 'm1', 'only_m1', false);
  assert pg_temp.n_avisos('expense:' || v_e2 || ':%') = 0, 'FALLO: avisa de un gasto privado';

  -- personal pero visible (solo de Ana y pagado por Ana): no le afecta a Beto, nada
  insert into public.expenses (id, couple_id, created_by, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner)
  values (v_e3, v_c, v_a, 'Libro', 1500, 'leisure', current_date, 'm1', 'only_m1', true);
  assert pg_temp.n_avisos('expense:' || v_e3 || ':%') = 0, 'FALLO: avisa de un gasto personal visible';

  -- sin sesión (job diario): nada
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.expenses (id, couple_id, created_by, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner)
  values (v_e4, v_c, v_a, 'Del job', 1000, 'home', current_date, 'm1', 'half', true);
  assert pg_temp.n_avisos('expense:' || v_e4 || ':%') = 0, 'FALLO: avisa de un gasto sin sesión';

  -- preferencia desactivada
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  update public.couple_members set notify_partner_expense = false where user_id = v_b;
  insert into public.expenses (id, couple_id, created_by, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner)
  values (v_e5, v_c, v_a, 'Sin preferencia', 1000, 'home', current_date, 'm1', 'half', true);
  assert pg_temp.n_avisos('expense:' || v_e5 || ':%') = 0, 'FALLO: avisa con notify_partner_expense desactivado';
  update public.couple_members set notify_partner_expense = true where user_id = v_b;
end $$;

-- B6. Un error dentro del aviso no deshace la operación original. Sin tocar la estructura de push_outbox
--     (un ALTER TABLE bloquearía la cola y los triggers de los usuarios reales hasta el ROLLBACK):
--     - etiqueta de 600 caracteres → el cuerpo supera 500 y el CHECK de push_outbox falla dentro de enqueue_push;
--     - «sub» que no es un uuid → auth.uid() falla dentro del aviso (gasto, liquidación, respuesta y propuesta).
do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000c1';
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_b constant uuid := '00000000-0000-4000-8000-0000000000a2';
  v_d uuid := gen_random_uuid();
  v_e uuid := gen_random_uuid();
  v_s uuid := gen_random_uuid();
  v_p uuid;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  insert into public.deletion_requests (id, couple_id, target_type, target_id, target_label, requested_by)
  values (v_d, v_c, 'expense', gen_random_uuid(), repeat('x', 600), v_a);
  assert exists (select 1 from public.deletion_requests where id = v_d), 'FALLO: un fallo de avisos deshizo la petición de borrado';
  assert pg_temp.n_avisos('deletion:' || v_d || ':%') = 0, 'FALLO: debía fallar el encolado en esta prueba';

  perform set_config('request.jwt.claims', '{"sub":"no-es-un-uuid","role":"authenticated"}', true);
  insert into public.expenses (id, couple_id, created_by, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner)
  values (v_e, v_c, v_a, 'Falla el aviso', 1000, 'home', current_date, 'm1', 'half', true);
  assert exists (select 1 from public.expenses where id = v_e), 'FALLO: un fallo de avisos deshizo el gasto';

  insert into public.settlements (id, couple_id, from_slot, to_slot, amount_cents, method, created_by)
  values (v_s, v_c, 'm1', 'm2', 1000, 'cash', v_a);
  assert exists (select 1 from public.settlements where id = v_s), 'FALLO: un fallo de avisos deshizo la liquidación';
  update public.settlements set status = 'confirmed', responded_by = v_b, responded_at = now() where id = v_s;
  assert (select status = 'confirmed' from public.settlements where id = v_s), 'FALLO: un fallo de avisos deshizo la confirmación';

  delete from public.settings_proposals where couple_id = v_c and status = 'pending';
  insert into public.settings_proposals (couple_id, proposed_by, changes)
  values (v_c, v_b, '{"proportional_pct_m1": 70}'::jsonb) returning id into v_p;
  assert exists (select 1 from public.settings_proposals where id = v_p), 'FALLO: un fallo de avisos deshizo la propuesta';

  assert pg_temp.n_avisos('expense:' || v_e || ':%') + pg_temp.n_avisos('settlement:' || v_s || ':%')
         + pg_temp.n_avisos('proposal:' || v_p || ':%') = 0, 'FALLO: debía fallar el aviso en esta prueba';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B7. Final
do $$
begin
  raise notice 'PRUEBAS DE AVISOS (fase 4): todas correctas';
end $$;

rollback;
