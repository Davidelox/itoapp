-- =============================================================================
-- ito · Avisos push: edición de un gasto (patrón de 20261125000000_avisos_pareja.sql)
--
-- Qué hace: trigger AFTER UPDATE en expenses que avisa a la otra persona cuando se EDITA un gasto
-- (la creación ya avisa con private.aviso_gasto: no se duplica).
--   «Ana ha editado un gasto: Cena (importe 40 € → 45 €, fecha 12/11/2026)»   (notify_partner_expense)
--
-- Reglas:
--   - Solo cambios reales: concepto, importe, fecha, categoría, quién pagó o el reparto. Cambiar notas, recibo,
--     vínculos o la liquidación (settlement_id) no avisa.
--   - Solo gastos visibles para la pareja antes y después de editar, y que afectan a la otra persona
--     (le toca una parte, la paga ella o interviene el bote; antes o después del cambio).
--   - Privado → compartido: para la pareja es un gasto nuevo. «Gasto nuevo · Ana ha compartido Cena · 45 €», solo
--     con los datos nuevos (nunca el importe que tuvo mientras era privado) y si le afecta tras el cambio.
--   - Compartido → privado: sin aviso.
--   - Sin sesión (auth.uid() nulo) no avisa; nunca se avisa a quien edita.
--   - Anti-spam: un aviso por gasto y destinatario cada 10 minutos (ventana deslizante sobre push_outbox y
--     clave dedupe con el tramo de 10 min para las ediciones simultáneas; el aviso ya encolado no se
--     actualiza, así que muestra el primer cambio de la ventana).
--   - Un fallo de avisos NUNCA rompe la edición (when others → warning).
--   - Reutiliza la preferencia notify_partner_expense (activada por defecto): no hay columna nueva.
--
-- Requiere 20261125000000_avisos_pareja.sql. Idempotente. La parte A va en su transacción y la parte B
-- (pruebas) acaba en ROLLBACK. NO aplicada: la ejecuta David en el SQL Editor.
-- =============================================================================

begin;

do $$
begin
  if to_regprocedure('private.aviso_gasto()') is null then
    raise exception 'Aplica antes 20261125000000_avisos_pareja.sql';
  end if;
end $$;

create or replace function private.aviso_gasto_editado() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor     uuid;
  v_name      text;
  v_compartir boolean;  -- privado → visible: para la pareja es un gasto nuevo
  v_prefix    text;
  v_title     text;
  v_body      text;
  v_cambios   text[] := '{}';
  v_bucket    text;
  r           record;
begin
  begin
    v_actor := auth.uid();  -- dentro del bloque protegido: si falla, tampoco rompe la operación
    if v_actor is null or not new.visible_to_partner then
      return null;
    end if;
    v_compartir := not old.visible_to_partner;

    select coalesce(nullif(btrim(p.display_name), ''), 'Tu pareja') into v_name
    from public.profiles p where p.id = v_actor;
    v_name := coalesce(v_name, 'Tu pareja');

    if v_compartir then
      -- Solo los datos nuevos: nada de cómo era el gasto mientras fue privado.
      v_prefix := 'expense_shared:' || new.id || ':';
      v_title  := 'Gasto nuevo';
      v_body   := v_name || ' ha compartido ' || new.concept || ' · '
                  || private.format_money(new.amount_cents, new.currency::text);
    else
      if new.amount_cents <> old.amount_cents then
        v_cambios := v_cambios || ('importe ' || private.format_money(old.amount_cents, old.currency::text)
                                   || ' → ' || private.format_money(new.amount_cents, new.currency::text));
      end if;
      if new.spent_on <> old.spent_on then
        v_cambios := v_cambios || ('fecha ' || to_char(new.spent_on, 'DD/MM/YYYY'));
      end if;
      if new.concept <> old.concept then
        v_cambios := v_cambios || ('antes «' || left(old.concept, 40) || '»');
      end if;
      if new.paid_by is distinct from old.paid_by or new.split_mode is distinct from old.split_mode
         or new.split_pct_m1 is distinct from old.split_pct_m1 then
        v_cambios := v_cambios || 'reparto';
      end if;
      v_prefix := 'expense_edit:' || new.id || ':';
      v_title  := 'Gasto editado';
      v_body   := v_name || ' ha editado un gasto: ' || new.concept
                  || case when cardinality(v_cambios) > 0
                          then ' (' || array_to_string(v_cambios, ', ') || ')' else '' end;
    end if;

    v_bucket := floor(extract(epoch from now()) / 600)::bigint::text;

    for r in
      select m.user_id, m.slot from public.couple_members m
      where m.couple_id = new.couple_id and m.left_at is null and m.user_id <> v_actor
    loop
      -- Le afecta (antes o después; al compartir, solo después: antes era privado y no le tocaba nada).
      if (case r.slot when 'm1' then new.share_m1_cents when 'm2' then new.share_m2_cents else 0 end) > 0
         or new.share_pot_cents > 0
         or new.paid_by::text in (r.slot::text, 'pot')
         or (not v_compartir and (
              (case r.slot when 'm1' then old.share_m1_cents when 'm2' then old.share_m2_cents else 0 end) > 0
              or old.share_pot_cents > 0
              or old.paid_by::text in (r.slot::text, 'pot'))) then
        -- Ventana deslizante: si ya hay un aviso de este tipo para este gasto y esta persona en los últimos
        -- 10 minutos (aunque sea del tramo anterior), no se repite. La clave con el tramo cubre las ediciones
        -- simultáneas (on conflict do nothing en enqueue_push).
        if exists (select 1 from public.push_outbox o
                   where o.user_id = r.user_id
                     and starts_with(o.dedupe_key, v_prefix)
                     and o.created_at > now() - interval '10 minutes') then
          continue;
        end if;
        perform private.enqueue_push(r.user_id, new.couple_id, 'partner_expense',
                                     v_prefix || v_bucket || ':' || r.user_id,
                                     v_title, v_body, '/gastos/' || new.id, 'notify_partner_expense');
      end if;
    end loop;
  exception when others then
    raise warning 'aviso_gasto_editado: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists y_aviso_edicion on public.expenses;
create trigger y_aviso_edicion after update on public.expenses
  for each row when (
    new.concept is distinct from old.concept or new.amount_cents is distinct from old.amount_cents
    or new.spent_on is distinct from old.spent_on or new.category is distinct from old.category
    or new.paid_by is distinct from old.paid_by or new.split_mode is distinct from old.split_mode
    or new.split_pct_m1 is distinct from old.split_pct_m1
    or (new.visible_to_partner and not old.visible_to_partner)
  )
  execute function private.aviso_gasto_editado();

revoke all on function private.aviso_gasto_editado() from public, anon, authenticated;

commit;

-- =============================================================================
-- PARTE B · Pruebas (no dejan nada: todo acaba en ROLLBACK). Ejecutar en el SQL Editor como postgres.
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

do $$
begin
  assert not has_function_privilege('authenticated', 'private.aviso_gasto_editado()', 'execute'), 'FALLO: authenticated ejecuta aviso_gasto_editado';
  assert (select prosecdef from pg_proc where oid = 'private.aviso_gasto_editado()'::regprocedure), 'FALLO: debe ser security definer';
  assert exists (select 1 from pg_trigger where tgname = 'y_aviso_edicion' and tgrelid = 'public.expenses'::regclass), 'FALLO: falta el trigger';
end $$;

do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000c1';
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_b constant uuid := '00000000-0000-4000-8000-0000000000a2';
  v_e1 uuid := gen_random_uuid(); v_e2 uuid := gen_random_uuid(); v_e3 uuid := gen_random_uuid();
begin
  -- Ana crea un gasto compartido (el alta no genera aviso de edición)
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  insert into public.expenses (id, couple_id, created_by, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner)
  values (v_e1, v_c, v_a, 'Cena', 4000, 'eating_out', '2026-11-12', 'm1', 'half', true);
  assert pg_temp.n_avisos('expense_edit:%') = 0, 'FALLO: el alta avisa como edición';

  -- Editar solo las notas: nada
  update public.expenses set notes = 'hola' where id = v_e1;
  assert pg_temp.n_avisos('expense_edit:' || v_e1 || ':%') = 0, 'FALLO: avisa por editar notas';

  -- Cambiar el importe: avisa solo a Beto, con el texto esperado
  update public.expenses set amount_cents = 4500 where id = v_e1;
  assert pg_temp.n_avisos('expense_edit:' || v_e1 || ':%', v_b) = 1 and pg_temp.n_avisos('expense_edit:' || v_e1 || ':%', v_a) = 0,
         'FALLO: la edición debe avisar solo a la pareja';
  assert (select title || ' | ' || body || ' | ' || kind || ' | ' || url from public.push_outbox where dedupe_key like 'expense_edit:' || v_e1 || ':%')
         = 'Gasto editado | Ana ha editado un gasto: Cena (importe 40 € → 45 €) | partner_expense | /gastos/' || v_e1,
         'FALLO: texto de la edición';

  -- Otra edición en los 10 minutos siguientes: no duplica
  update public.expenses set amount_cents = 4600 where id = v_e1;
  assert pg_temp.n_avisos('expense_edit:' || v_e1 || ':%', v_b) = 1, 'FALLO: spam de avisos de edición';

  -- Sin sesión: nada
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.expenses (id, couple_id, created_by, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner)
  values (v_e2, v_c, v_a, 'Del job', 1000, 'home', current_date, 'm1', 'half', true);
  update public.expenses set amount_cents = 1100 where id = v_e2;
  assert pg_temp.n_avisos('expense_edit:' || v_e2 || ':%') = 0, 'FALLO: avisa sin sesión';

  -- Gasto personal visible (no afecta a Beto): nada
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  insert into public.expenses (id, couple_id, created_by, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner)
  values (v_e3, v_c, v_a, 'Libro', 1500, 'leisure', current_date, 'm1', 'only_m1', true);
  update public.expenses set amount_cents = 1600 where id = v_e3;
  assert pg_temp.n_avisos('expense_edit:' || v_e3 || ':%') = 0, 'FALLO: avisa de un gasto personal';

  -- Preferencia desactivada
  update public.couple_members set notify_partner_expense = false where user_id = v_b;
  update public.expenses set concept = 'Cena 2', spent_on = '2026-11-13' where id = v_e2;
  update public.expenses set concept = 'Cena grande' where id = v_e1;
  assert pg_temp.n_avisos('expense_edit:' || v_e2 || ':%') = 0, 'FALLO: avisa con la preferencia desactivada';
  update public.couple_members set notify_partner_expense = true where user_id = v_b;

  -- Un fallo del aviso no deshace la edición
  perform set_config('request.jwt.claims', '{"sub":"no-es-un-uuid","role":"authenticated"}', true);
  update public.expenses set amount_cents = 4700 where id = v_e1;
  assert (select amount_cents = 4700 from public.expenses where id = v_e1), 'FALLO: un fallo de avisos deshizo la edición';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000c1';
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_b constant uuid := '00000000-0000-4000-8000-0000000000a2';
  v_e4 uuid := gen_random_uuid(); v_e5 uuid := gen_random_uuid();
  v_bucket bigint := floor(extract(epoch from now()) / 600)::bigint;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  insert into public.expenses (id, couple_id, created_by, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner)
  values (v_e4, v_c, v_a, 'Taxi', 2000, 'transport', current_date, 'm1', 'half', true),
         (v_e5, v_c, v_a, 'Regalo', 3000, 'gifts', current_date, 'm1', 'only_m1', false);

  -- Beto edita un gasto de Ana: avisa a Ana, no a Beto
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
  update public.expenses set category = 'leisure' where id = v_e4;
  assert pg_temp.n_avisos('expense_edit:' || v_e4 || ':%', v_a) = 1 and pg_temp.n_avisos('expense_edit:' || v_e4 || ':%', v_b) = 0,
         'FALLO: la edición de Beto debe avisar solo a Ana';

  -- Ventana deslizante: un aviso del tramo anterior de hace 5 min bloquea; uno de hace 11 min ya no
  delete from public.push_outbox where dedupe_key like 'expense_edit:' || v_e4 || ':%';
  insert into public.push_outbox (user_id, couple_id, kind, dedupe_key, title, body, created_at)
  values (v_a, v_c, 'partner_expense', 'expense_edit:' || v_e4 || ':' || (v_bucket - 1) || ':' || v_a, 'T', 'B', now() - interval '5 minutes');
  update public.expenses set amount_cents = 2100 where id = v_e4;
  assert pg_temp.n_avisos('expense_edit:' || v_e4 || ':%', v_a) = 1, 'FALLO: repite el aviso dentro de la ventana de 10 min';
  update public.push_outbox set created_at = now() - interval '11 minutes' where dedupe_key like 'expense_edit:' || v_e4 || ':%';
  update public.expenses set amount_cents = 2200 where id = v_e4;
  assert pg_temp.n_avisos('expense_edit:' || v_e4 || ':%', v_a) = 2, 'FALLO: no avisa pasada la ventana de 10 min';

  -- Saldar (solo cambia settlement_id) no avisa
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  delete from public.push_outbox where dedupe_key like 'expense_edit:%';
  perform public.create_settlement(gen_random_uuid(), array[v_e4], 'cash');
  assert (select settlement_id is not null from public.expenses where id = v_e4), 'FALLO: la prueba no ha saldado el gasto';
  assert pg_temp.n_avisos('expense_edit:%') = 0, 'FALLO: saldar avisa como edición';

  -- Compartido → privado con otro importe: sin aviso
  update public.expenses set visible_to_partner = false, split_mode = 'only_m1', amount_cents = 999
  where id = (select id from public.expenses where concept = 'Cena grande' and couple_id = v_c);
  assert pg_temp.n_avisos('expense_edit:%') + pg_temp.n_avisos('expense_shared:%') = 0, 'FALLO: avisa de un gasto que pasa a ser privado';

  -- Privado → visible pero solo de Ana: no le afecta a Beto, sin aviso
  update public.expenses set visible_to_partner = true where id = v_e5;
  assert pg_temp.n_avisos('expense_edit:%') + pg_temp.n_avisos('expense_shared:%') = 0, 'FALLO: avisa de un gasto compartido que no afecta a la pareja';
  update public.expenses set visible_to_partner = false where id = v_e5;

  -- Privado → compartido con otro importe: «Gasto nuevo» solo a Beto, con el importe nuevo y sin el anterior
  update public.expenses set amount_cents = 3050 where id = v_e5;  -- edición privada: nada
  update public.expenses set visible_to_partner = true, split_mode = 'half', amount_cents = 3100 where id = v_e5;
  assert pg_temp.n_avisos('expense_shared:' || v_e5 || ':%', v_b) = 1 and pg_temp.n_avisos('expense_shared:' || v_e5 || ':%', v_a) = 0
         and pg_temp.n_avisos('expense_edit:' || v_e5 || ':%') = 0,
         'FALLO: compartir un gasto privado debe avisar solo a la pareja, como gasto nuevo';
  assert (select title || ' | ' || body || ' | ' || kind || ' | ' || url from public.push_outbox where dedupe_key like 'expense_shared:' || v_e5 || ':%')
         = 'Gasto nuevo | Ana ha compartido Regalo · 31 € | partner_expense | /gastos/' || v_e5,
         'FALLO: texto de gasto compartido (no debe revelar el importe privado)';

  -- Volver a privado y compartir otra vez dentro de 10 min: no repite
  update public.expenses set visible_to_partner = false, split_mode = 'only_m1' where id = v_e5;
  update public.expenses set visible_to_partner = true, split_mode = 'half', amount_cents = 3200 where id = v_e5;
  assert pg_temp.n_avisos('expense_shared:' || v_e5 || ':%') = 1, 'FALLO: spam al compartir varias veces';

  -- Preferencia desactivada: compartir no avisa
  delete from public.push_outbox where dedupe_key like 'expense_shared:%';
  update public.couple_members set notify_partner_expense = false where user_id = v_b;
  update public.expenses set visible_to_partner = false, split_mode = 'only_m1' where id = v_e5;
  update public.expenses set visible_to_partner = true, split_mode = 'half' where id = v_e5;
  assert pg_temp.n_avisos('expense_shared:%') = 0, 'FALLO: compartir avisa con la preferencia desactivada';
  update public.couple_members set notify_partner_expense = true where user_id = v_b;
  perform set_config('request.jwt.claims', '{}', true);
end $$;

do $$
begin
  raise notice 'PRUEBAS DE AVISOS (edición de gasto): todas correctas';
end $$;

rollback;
