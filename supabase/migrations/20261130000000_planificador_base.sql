-- =============================================================================
-- ito · Planificador, fase F1: reglas de base de planes, tareas, ideas y gastos de un plan
-- (docs/plan-planificador.md §2 «Huecos de seguridad y dinero» y §3 M1; docs/modelo-datos.md §3, §5, §6 y §13)
--
-- Qué cierra:
--   1. Gastos de un plan, siempre compartidos (decisión 4): un gasto privado no puede llevar plan_id.
--      - CHECK expenses_plan_compartido (plan_id is null or visible_to_partner).
--      - expenses_before_write lo comprueba antes con un código propio (TW066) y la herencia de plan_id desde el
--        evento solo se hace si el gasto es visible: un gasto privado de un evento del plan se queda fuera del plan
--        (y entra si después se hace visible).
--      - Así plan_summaries (security_invoker) da el mismo spent_cents y expense_count a los dos sin tocar la vista.
--   2. plan_tasks.place_id e ideas.place_id: solo un sitio que ves (TW064, como en gastos, eventos y visitas).
--   3. plan_tasks.event_id / expense_id: el evento o gasto existe, lo ves y es de ESTE plan (TW060). Con eso no se
--      puede enlazar el evento secreto de la pareja (además, un secreto nunca está en un plan) ni su gasto privado
--      (que tampoco puede estar en un plan, punto 1), ni algo de otro plan o suelto. En un UPDATE, plan_id y
--      couple_id no cambian (el servidor ignora lo que se mande).
--   4. plans: duración máxima 60 días contando los dos extremos, como la app (end_date - start_date <= 59, CHECK
--      plans_duracion), «Personalizado» exige porcentaje
--      (CHECK plans_reparto_custom), «A medias» guarda 50 y «Bote» no lleva %, y «Bote» solo si el bote está
--      activado al crearlo o al cambiar a bote (TW012, como en gastos y recurrentes; editar otra cosa de un plan de
--      bote con el bote ya apagado sigue funcionando).
--   5. Borrar un plan cuyo itinerario tiene gastos fallaba con 23503 (§5): snapshot_before_delete quita plan_id a sus
--      gastos en el mismo UPDATE que copia el nombre del plan. Sin cambio de resultado: gastos y sitios se quedan.
--
-- Datos de producción (consultado en solo lectura el 2026-11-20): 0 planes, 0 tareas, 0 ideas, 0 gastos con plan_id,
-- 0 eventos con plan_id. Ninguna fila incumple las reglas nuevas: los CHECK se crean validados. Si al aplicarla ya
-- hubiera filas que las incumplen, el paso 0 se detiene SIN cambiar nada y dice cuáles (no se migran solas: hacer
-- visible un gasto privado lo revelaría y quitarle el plan perdería el enlace; lo decide David).
--
-- Contrato para la app (sin columnas nuevas ni RPC nuevas):
--   · Gastos: con plan_id, visible_to_partner siempre true (el formulario oculta «Visible para…»).
--       TW066 «Un gasto de un plan lo veis los dos»: plan_id con gasto privado (alta o edición), o hacer privado un
--       gasto que ya está en un plan. Un gasto privado de un evento del plan se guarda SIN plan_id
--       (al hacerlo visible, el servidor le pone el plan del evento).
--   · Planes: 23514 duración de más de 60 días contando inicio y fin (end_date - start_date > 59; la app ya lo
--       valida con duracionPlan/MAX_DIAS_PLAN), «custom» sin porcentaje
--       (y los de siempre: fin antes del inicio, nombre 1–80, icono 1–16, presupuesto <= 0).
--       TW012 «El bote común no está activado» al crear un plan con default_split_mode = 'pot' o cambiarlo a 'pot'.
--       default_split_pct_m1: 'half' → 50 siempre; 'pot' → null; 'proportional' null = el % de la pareja al apuntar.
--   · Tareas (plan_tasks): TW064 sitio que no existe o no ves · TW060 evento o gasto que no existe, no ves o no es
--       de este plan · plan_id y couple_id fijos en un UPDATE. Marcar hecha / editar el título no se comprueba.
--   · Ideas: TW064 sitio que no existe o no ves.
--
-- Códigos: TW066 nuevo (no se usaba: comprobado con grep en supabase/, lib/, app/, components/ y docs/).
-- TW012, TW060 y TW064 se reutilizan con el mismo significado. Sin código nuevo para la duración: 23514 es el
-- respaldo; la app ya valida fechas, reparto y presupuesto antes de enviar.
-- Funciones: expenses_before_write parte de la definición de producción (pg_get_functiondef, 2026-11-20, idéntica a
-- 20261126000000_mapa.sql) y cambia solo lo marcado [Planificador F1]; plan_tasks_before_write parte de
-- 20261113000000_esquema_inicial.sql (idéntica a producción) y añade el bloque marcado; snapshot_before_delete parte
-- de producción (= 20261126000000_mapa.sql) y cambia una línea. plans_before_write e ideas_before_write son nuevas.
-- Las de validación son security invoker (los exists aplican la RLS de quien escribe); snapshot_before_delete
-- sigue siendo security definer.
-- Requiere 20261129000000_visitas_y_reserva.sql.
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
  if to_regclass('public.place_visits') is null then
    raise exception 'Aplica antes 20261129000000_visitas_y_reserva.sql';
  end if;

  select count(*) into v_n from public.expenses where plan_id is not null and not visible_to_partner;
  if v_n > 0 then
    raise exception 'Hay % gastos privados con plan: decide antes si se hacen visibles o se sacan del plan', v_n;
  end if;
  select count(*) into v_n from public.plans where end_date - start_date > 59;
  if v_n > 0 then
    raise exception 'Hay % planes de más de 60 días: acórtalos antes', v_n;
  end if;
  select count(*) into v_n from public.plans where default_split_mode = 'custom' and default_split_pct_m1 is null;
  if v_n > 0 then
    raise exception 'Hay % planes «Personalizado» sin porcentaje: pónselo antes', v_n;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Gastos de un plan, siempre compartidos (TW066 + CHECK)
--    Cuerpo idéntico al de producción (= 20261126000000_mapa.sql) salvo los bloques [Planificador F1].
-- -----------------------------------------------------------------------------
create or replace function private.expenses_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_client   boolean := private.is_client_write();
  v_pot      boolean;
  v_pct      smallint;
  v_currency char(3);
  v_slot     public.party;
begin
  if tg_op = 'INSERT' then
    if v_client then
      new.created_by := auth.uid();
      if new.settlement_id is not null then
        raise exception 'settlement_id solo lo asignan las RPC de liquidación' using errcode = 'TW015';
      end if;
    end if;
  else
    new.created_by := old.created_by;
    if v_client and new.settlement_id is distinct from old.settlement_id then
      raise exception 'settlement_id solo lo asignan las RPC de liquidación' using errcode = 'TW015';
    end if;
    if v_client and new.visible_to_partner is distinct from old.visible_to_partner
       and old.created_by is distinct from auth.uid() then
      raise exception 'Solo quien lo creó puede cambiar su visibilidad' using errcode = 'TW013';
    end if;
  end if;

  -- Porcentaje: a medias = 50; proporcional sin % = el de los ajustes; el resto no lleva %.
  if new.split_mode = 'half' then
    new.split_pct_m1 := 50;
  elsif new.split_mode = 'proportional' and new.split_pct_m1 is null then
    select s.proportional_pct_m1 into new.split_pct_m1 from public.couple_settings s where s.couple_id = new.couple_id;
  elsif new.split_mode not in ('proportional', 'custom') then
    new.split_pct_m1 := null;
  end if;

  -- Las partes las calcula siempre el servidor (lo que mande el cliente se ignora).
  select c.m1, c.m2, c.pot into new.share_m1_cents, new.share_m2_cents, new.share_pot_cents
  from private.compute_shares(new.amount_cents, new.split_mode, new.split_pct_m1) c;

  -- Un gasto saldado (o pendiente de confirmar) no cambia de importe ni de reparto.
  if tg_op = 'UPDATE' and old.settlement_id is not null and new.settlement_id is not null and (
       new.amount_cents <> old.amount_cents or new.paid_by <> old.paid_by or new.split_mode <> old.split_mode
       or new.split_pct_m1 is distinct from old.split_pct_m1 or new.currency <> old.currency) then
    raise exception 'Este gasto ya está saldado: deshaz la liquidación para cambiar el importe o el reparto'
      using errcode = 'TW010';
  end if;

  -- Moneda única por pareja (los saldos suman céntimos sin convertir).
  if tg_op = 'INSERT' or new.currency <> old.currency then
    select c.currency into v_currency from public.couples c where c.id = new.couple_id;
    if new.currency <> v_currency then
      raise exception 'La moneda del gasto debe ser %', v_currency using errcode = 'TW014';
    end if;
  end if;

  -- El bote solo se puede usar si está activado (se comprueba al crearlo o cambiarlo).
  if (new.paid_by = 'pot' or new.split_mode = 'pot')
     and (tg_op = 'INSERT' or new.paid_by <> old.paid_by or new.split_mode <> old.split_mode) then
    select s.pot_enabled into v_pot from public.couple_settings s where s.couple_id = new.couple_id;
    if not coalesce(v_pot, false) then
      raise exception 'El bote común no está activado' using errcode = 'TW012';
    end if;
  end if;

  -- Un gasto privado tiene que ser de quien lo creó (el CHECK ya exige paid_by = dueño).
  if not new.visible_to_partner then
    v_slot := private.slot_of(new.couple_id, new.created_by);
    if v_slot is null or new.paid_by <> v_slot then
      raise exception 'Un gasto privado tiene que ser solo tuyo y pagado por ti' using errcode = 'TW011';
    end if;
  end if;

  -- Solo se puede enlazar un evento que quien escribe puede ver (no el evento secreto de la pareja).
  if v_client and new.event_id is not null and (tg_op = 'INSERT' or new.event_id is distinct from old.event_id)
     and not exists (select 1 from public.events e where e.id = new.event_id) then
    raise exception 'Evento no encontrado' using errcode = 'TW060';
  end if;

  -- [Mapa F1] Solo se puede enlazar un sitio que quien escribe puede ver (no el sitio privado de la pareja).
  if v_client and new.place_id is not null and (tg_op = 'INSERT' or new.place_id is distinct from old.place_id)
     and not exists (select 1 from public.places p where p.id = new.place_id) then
    raise exception 'Sitio no encontrado' using errcode = 'TW064';
  end if;

  -- Si va a un evento de un plan, cuenta también en el plan.
  -- [Planificador F1] Solo si es visible: un gasto privado de un evento del plan se queda fuera del plan, y entra
  -- en el plan si después se hace visible.
  if new.event_id is not null and new.plan_id is null and new.visible_to_partner
     and (tg_op = 'INSERT' or new.event_id is distinct from old.event_id or not old.visible_to_partner) then
    select e.plan_id into new.plan_id from public.events e where e.id = new.event_id;
  end if;

  -- [Planificador F1] Un gasto de un plan lo veis los dos (antes del CHECK, para dar un código traducible).
  if new.plan_id is not null and not new.visible_to_partner then
    raise exception 'Un gasto de un plan lo veis los dos' using errcode = 'TW066';
  end if;

  return new;
end $$;

alter table public.expenses drop constraint if exists expenses_plan_compartido;
alter table public.expenses add constraint expenses_plan_compartido check (plan_id is null or visible_to_partner);

-- -----------------------------------------------------------------------------
-- 2. Planes: duración, reparto y bote
-- -----------------------------------------------------------------------------
alter table public.plans drop constraint if exists plans_duracion;
alter table public.plans add constraint plans_duracion check (end_date - start_date <= 59);  -- 60 días con los dos extremos
alter table public.plans drop constraint if exists plans_reparto_custom;
alter table public.plans add constraint plans_reparto_custom
  check (default_split_mode <> 'custom' or default_split_pct_m1 is not null);

-- «A medias» = 50 y «Bote» sin %; el bote solo si está activado al elegirlo (TW012, como recurring_before_write).
create or replace function private.plans_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_pot boolean;
begin
  if new.default_split_mode = 'half' then
    new.default_split_pct_m1 := 50;
  elsif new.default_split_mode = 'pot' then
    new.default_split_pct_m1 := null;
  end if;

  if new.default_split_mode = 'pot'
     and (tg_op = 'INSERT' or new.default_split_mode <> old.default_split_mode) then
    select s.pot_enabled into v_pot from public.couple_settings s where s.couple_id = new.couple_id;
    if not coalesce(v_pot, false) then
      raise exception 'El bote común no está activado' using errcode = 'TW012';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists b_rules on public.plans;
create trigger b_rules before insert or update on public.plans
  for each row execute function private.plans_before_write();

-- -----------------------------------------------------------------------------
-- 3. Tareas: sitio que ves (TW064); evento y gasto que ves y del mismo plan (TW060); plan fijo
--    Cuerpo idéntico al de producción (= 20261113000000_esquema_inicial.sql) salvo el bloque [Planificador F1].
-- -----------------------------------------------------------------------------
create or replace function private.plan_tasks_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
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
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Ideas: solo un sitio que ves (TW064)
-- -----------------------------------------------------------------------------
create or replace function private.ideas_before_write() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_client_write() and new.place_id is not null
     and (tg_op = 'INSERT' or new.place_id is distinct from old.place_id)
     and not exists (select 1 from public.places p where p.id = new.place_id) then
    raise exception 'Sitio no encontrado' using errcode = 'TW064';
  end if;
  return new;
end $$;

drop trigger if exists b_rules on public.ideas;
create trigger b_rules before insert or update on public.ideas
  for each row execute function private.ideas_before_write();

-- -----------------------------------------------------------------------------
-- 5. Borrar un plan con gastos en su itinerario (fallo hasta ahora: 23503 y el borrado no se hacía)
--    Al borrar el plan, y_snapshot copia su nombre en sus gastos (UPDATE en esta transacción). Después la cascada
--    borra sus eventos y el y_snapshot de cada evento vuelve a tocar esos gastos: como la fila ya se modificó en
--    esta transacción, Postgres revisa todas sus FK y la del plan (aún con plan_id) ya no encuentra el plan → 23503.
--    Arreglo: el mismo UPDATE que copia el nombre del plan quita plan_id (lo que haría después la FK con
--    on delete set null). Cuerpo idéntico al de producción (pg_get_functiondef, 2026-11-20, = 20261126000000_mapa.sql)
--    salvo la línea marcada.
-- -----------------------------------------------------------------------------
create or replace function private.snapshot_before_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'places' then
    update public.expenses set place_name_snapshot = old.name
    where place_id = old.id and (old.visible_to_partner or not visible_to_partner);
  elsif tg_table_name = 'events' then
    -- El título de un evento secreto solo se copia en gastos que la pareja no ve.
    update public.expenses set event_title_snapshot = old.title
    where event_id = old.id and (not old.is_secret or not visible_to_partner);
  elsif tg_table_name = 'plans' then
    -- [Planificador F1] plan_id := null aquí y no después en la FK (ver arriba).
    update public.expenses set plan_name_snapshot = old.name, plan_icon_snapshot = old.icon, plan_id = null
    where plan_id = old.id;
  end if;
  return old;
end $$;

-- -----------------------------------------------------------------------------
-- 6. Permisos explícitos: las funciones de trigger no se conceden a nadie
--    (los triggers no comprueban EXECUTE al dispararse).
-- -----------------------------------------------------------------------------
revoke all on function private.expenses_before_write()   from public, anon, authenticated;
revoke all on function private.plans_before_write()      from public, anon, authenticated;
revoke all on function private.plan_tasks_before_write() from public, anon, authenticated;
revoke all on function private.ideas_before_write()      from public, anon, authenticated;
revoke all on function private.snapshot_before_delete()  from public, anon, authenticated;

commit;

-- =============================================================================
-- PARTE B · Pruebas (no dejan nada: todo acaba en ROLLBACK). Ejecutar como postgres.
-- Si una prueba falla, el script se detiene con «FALLO: ...» y la parte A ya está aplicada.
-- Escrituras «de la app» con set local role authenticated y auth.uid() simulado con request.jwt.claims
-- (se aplican la RLS y los triggers); las comprobaciones, como postgres.
-- No cambia la estructura de ninguna tabla ni toca filas reales: solo una pareja y dos usuarios de prueba.
--   Ana (…0000000000ed, m1) y Beto (…0000000000ee, m2).
-- =============================================================================
begin;
set local idle_in_transaction_session_timeout = '60s';

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000ed', 'planes-a@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000ee', 'planes-b@prueba.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-0000000000ed', 'Ana'),
  ('00000000-0000-4000-8000-0000000000ee', 'Beto')
on conflict (id) do update set display_name = excluded.display_name;
insert into public.couples (id) values ('00000000-0000-4000-8000-0000000000fd');
insert into public.couple_settings (couple_id) values ('00000000-0000-4000-8000-0000000000fd') on conflict do nothing;
insert into public.couple_members (couple_id, user_id, slot) values
  ('00000000-0000-4000-8000-0000000000fd', '00000000-0000-4000-8000-0000000000ed', 'm1'),
  ('00000000-0000-4000-8000-0000000000fd', '00000000-0000-4000-8000-0000000000ee', 'm2');

-- Datos de prueba (Ana): plan P1 «Lisboa» con un evento del itinerario, plan P2 «Oporto» con otro, un evento suelto,
-- un evento secreto, un sitio compartido y uno privado.
do $$
declare
  v_c constant uuid := '00000000-0000-4000-8000-0000000000fd';
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ed","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.plans (id, couple_id, type, name, icon, start_date, end_date) values
    ('00000000-0000-4000-8000-0000000c0001', v_c, 'trip', 'Lisboa', '✈️', '2030-06-01', '2030-06-04'),
    ('00000000-0000-4000-8000-0000000c0002', v_c, 'trip', 'Oporto', '🍷', '2030-07-01', '2030-07-03');
  insert into public.events (id, couple_id, title, start_date, plan_id) values
    ('00000000-0000-4000-8000-0000000c0101', v_c, 'Tranvía 28', '2030-06-02', '00000000-0000-4000-8000-0000000c0001'),
    ('00000000-0000-4000-8000-0000000c0102', v_c, 'Bodegas', '2030-07-02', '00000000-0000-4000-8000-0000000c0002');
  insert into public.events (id, couple_id, title, start_date) values
    ('00000000-0000-4000-8000-0000000c0103', v_c, 'Cena suelta', '2030-06-10');
  insert into public.events (id, couple_id, title, start_date, is_secret) values
    ('00000000-0000-4000-8000-0000000c0104', v_c, 'Sorpresa', '2030-06-03', true);
  insert into public.places (id, couple_id, name, lat, lng, provider, visible_to_partner) values
    ('00000000-0000-4000-8000-0000000c0201', v_c, 'Miradouro', 38.71, -9.13, 'manual', true),
    ('00000000-0000-4000-8000-0000000c0202', v_c, 'Joyería', 38.72, -9.14, 'manual', false);
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B1. Estructura y permisos
do $$
begin
  assert exists (select 1 from pg_constraint where conrelid = 'public.expenses'::regclass
                 and conname = 'expenses_plan_compartido' and convalidated),
         'FALLO: falta el CHECK expenses_plan_compartido (validado)';
  assert exists (select 1 from pg_constraint where conrelid = 'public.plans'::regclass
                 and conname = 'plans_duracion' and convalidated), 'FALLO: falta el CHECK plans_duracion';
  assert exists (select 1 from pg_constraint where conrelid = 'public.plans'::regclass
                 and conname = 'plans_reparto_custom' and convalidated), 'FALLO: falta el CHECK plans_reparto_custom';
  assert exists (select 1 from pg_trigger where not tgisinternal and tgname = 'b_rules'
                 and tgrelid = 'public.plans'::regclass and tgfoid = 'private.plans_before_write()'::regprocedure),
         'FALLO: falta el trigger b_rules en plans';
  assert exists (select 1 from pg_trigger where not tgisinternal and tgname = 'b_rules'
                 and tgrelid = 'public.ideas'::regclass and tgfoid = 'private.ideas_before_write()'::regprocedure),
         'FALLO: falta el trigger b_rules en ideas';
  assert exists (select 1 from pg_trigger where not tgisinternal and tgname = 'b_rules'
                 and tgrelid = 'public.plan_tasks'::regclass and tgfoid = 'private.plan_tasks_before_write()'::regprocedure),
         'FALLO: falta el trigger b_rules en plan_tasks';
  assert (select prosrc like '%[Mapa F1]%' and prosrc like '%[Planificador F1]%'
          from pg_proc where oid = 'private.expenses_before_write()'::regprocedure),
         'FALLO: expenses_before_write no parte de la de Mapa F1';
  assert not (select bool_or(prosecdef) from pg_proc where oid in (
           'private.expenses_before_write()'::regprocedure, 'private.plans_before_write()'::regprocedure,
           'private.plan_tasks_before_write()'::regprocedure, 'private.ideas_before_write()'::regprocedure)),
         'FALLO: las funciones de trigger deben ser security invoker (la RLS de quien escribe decide)';
  assert not has_function_privilege('authenticated', 'private.plans_before_write()', 'execute')
     and not has_function_privilege('authenticated', 'private.plan_tasks_before_write()', 'execute')
     and not has_function_privilege('authenticated', 'private.ideas_before_write()', 'execute')
     and not has_function_privilege('authenticated', 'private.expenses_before_write()', 'execute'),
         'FALLO: authenticated ejecuta funciones de trigger';
  assert (select prosecdef and prosrc like '%[Planificador F1]%' from pg_proc
          where oid = 'private.snapshot_before_delete()'::regprocedure),
         'FALLO: snapshot_before_delete debe seguir siendo security definer y llevar el arreglo';
  assert (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.plan_summaries'::regclass),
         'FALLO: plan_summaries ya no es security_invoker';
end $$;

-- B2. Gastos de un plan: siempre compartidos; herencia del evento solo si es visible; mismo total para los dos
do $$
declare
  v_c   constant uuid := '00000000-0000-4000-8000-0000000000fd';
  v_p1  constant uuid := '00000000-0000-4000-8000-0000000c0001';
  v_e1  constant uuid := '00000000-0000-4000-8000-0000000c0101';
  v_xa  constant uuid := '00000000-0000-4000-8000-0000000c0301';  -- compartido de Ana, del evento del plan
  v_xp  constant uuid := '00000000-0000-4000-8000-0000000c0302';  -- privado de Ana, del evento del plan
  v_xb  constant uuid := '00000000-0000-4000-8000-0000000c0303';  -- compartido de Beto, con plan_id directo
  v_xs  constant uuid := '00000000-0000-4000-8000-0000000c0304';  -- privado de Ana, sin plan
  v_xv  constant uuid := '00000000-0000-4000-8000-0000000c0307';  -- privado de Ana del evento del plan, luego visible
  v_s   public.plan_summaries;
  v_ok  boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ed","role":"authenticated"}', true);
  set local role authenticated;

  -- Privado con plan_id → TW066
  v_ok := false;
  begin
    insert into public.expenses (couple_id, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner, plan_id)
    values (v_c, 'Regalo', 3000, 'leisure', current_date, 'm1', 'only_m1', false, v_p1);
  exception when sqlstate 'TW066' then v_ok := true;
  end;
  assert v_ok, 'FALLO: un gasto privado con plan no da TW066';

  -- Privado de un evento del plan → se guarda sin plan_id
  insert into public.expenses (id, couple_id, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner, event_id)
  values (v_xp, v_c, 'Postal', 500, 'leisure', current_date, 'm1', 'only_m1', false, v_e1);
  -- Compartido del mismo evento → hereda plan_id
  insert into public.expenses (id, couple_id, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner, event_id)
  values (v_xa, v_c, 'Billetes tranvía', 6000, 'transport', current_date, 'm1', 'half', true, v_e1);
  -- Privado normal, sin plan: sigue funcionando
  insert into public.expenses (id, couple_id, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner)
  values (v_xs, v_c, 'Café', 200, 'eating_out', current_date, 'm1', 'only_m1', false);

  -- Hacer privado un gasto que está en un plan → TW066
  v_ok := false;
  begin
    update public.expenses set visible_to_partner = false, split_mode = 'only_m1' where id = v_xa;
  exception when sqlstate 'TW066' then v_ok := true;
  end;
  assert v_ok, 'FALLO: hacer privado un gasto de un plan no da TW066';

  -- Poner un plan a un gasto privado → TW066
  v_ok := false;
  begin
    update public.expenses set plan_id = v_p1 where id = v_xs;
  exception when sqlstate 'TW066' then v_ok := true;
  end;
  assert v_ok, 'FALLO: poner plan a un gasto privado no da TW066';

  -- Beto apunta un gasto compartido directamente al plan
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ee","role":"authenticated"}', true);
  insert into public.expenses (id, couple_id, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner, plan_id)
  values (v_xb, v_c, 'Alojamiento', 4000, 'other', current_date, 'm2', 'half', true, v_p1);
  select * into v_s from public.plan_summaries where plan_id = v_p1;
  assert v_s.expense_count = 2 and v_s.spent_cents = 10000,
         'FALLO: Beto ve ' || v_s.expense_count || ' gastos y ' || v_s.spent_cents || ' en el plan (deben ser 2 y 10000)';

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ed","role":"authenticated"}', true);
  select * into v_s from public.plan_summaries where plan_id = v_p1;
  assert v_s.expense_count = 2 and v_s.spent_cents = 10000,
         'FALLO: Ana ve ' || v_s.expense_count || ' gastos y ' || v_s.spent_cents || ' en el plan (deben ser 2 y 10000)';

  -- Un gasto privado de un evento del plan que después se hace visible entra en el plan
  insert into public.expenses (id, couple_id, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner, event_id)
  values (v_xv, v_c, 'Guía', 700, 'leisure', current_date, 'm1', 'only_m1', false, v_e1);
  update public.expenses set visible_to_partner = true where id = v_xv;
  reset role;
  assert (select plan_id = v_p1 from public.expenses where id = v_xv),
         'FALLO: el gasto del evento del plan que se hizo visible no entró en el plan';
  delete from public.expenses where id = v_xv;

  assert (select plan_id is null and event_id = v_e1 from public.expenses where id = v_xp),
         'FALLO: el gasto privado del evento del plan heredó el plan';
  assert (select plan_id = v_p1 from public.expenses where id = v_xa), 'FALLO: el gasto compartido no heredó el plan';
  assert (select visible_to_partner from public.expenses where id = v_xa), 'FALLO: el gasto del plan se volvió privado';
  assert (select plan_id is null from public.expenses where id = v_xs), 'FALLO: el gasto privado entró en el plan';

  -- También desde el servidor (RPC, job): TW066
  v_ok := false;
  begin
    insert into public.expenses (couple_id, created_by, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner, plan_id)
    values (v_c, '00000000-0000-4000-8000-0000000000ed', 'Servidor', 100, 'leisure', current_date, 'm1', 'only_m1', false, v_p1);
  exception when sqlstate 'TW066' then v_ok := true;
  end;
  assert v_ok, 'FALLO: el servidor puede crear un gasto privado con plan';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B3. Planes: duración, reparto personalizado, a medias = 50, bote solo si está activado
do $$
declare
  v_c   constant uuid := '00000000-0000-4000-8000-0000000000fd';
  v_p3  constant uuid := '00000000-0000-4000-8000-0000000c0003';
  v_p4  constant uuid := '00000000-0000-4000-8000-0000000c0004';
  v_p5  constant uuid := '00000000-0000-4000-8000-0000000c0005';
  v_ok  boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ee","role":"authenticated"}', true);
  set local role authenticated;

  -- 61 días contando los dos extremos (end - start = 60) → 23514; 60 (end - start = 59) se admite, como en la app
  v_ok := false;
  begin
    insert into public.plans (couple_id, type, name, icon, start_date, end_date)
    values (v_c, 'trip', 'Vuelta al mundo', '🌍', '2030-07-01', '2030-08-30');
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: un plan de 61 días se guarda';
  insert into public.plans (id, couple_id, type, name, icon, start_date, end_date, default_split_mode, default_split_pct_m1)
  values (v_p3, v_c, 'other', 'Mudanza', '📦', '2030-07-01', '2030-08-29', 'half', 30);

  -- Alargarlo después también choca
  v_ok := false;
  begin
    update public.plans set end_date = '2030-08-30' where id = v_p3;
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: alargar un plan a más de 60 días se guarda';

  -- Personalizado sin % → 23514; con % sí
  v_ok := false;
  begin
    insert into public.plans (couple_id, type, name, icon, start_date, end_date, default_split_mode)
    values (v_c, 'celebration', 'Cumple', '🎂', '2030-07-05', '2030-07-05', 'custom');
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: un plan personalizado sin porcentaje se guarda';
  insert into public.plans (id, couple_id, type, name, icon, start_date, end_date, default_split_mode, default_split_pct_m1)
  values (v_p4, v_c, 'celebration', 'Cumple', '🎂', '2030-07-05', '2030-07-05', 'custom', 70);
  v_ok := false;
  begin
    update public.plans set default_split_pct_m1 = null where id = v_p4;
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: quitar el porcentaje a un plan personalizado se guarda';

  -- Bote con el bote apagado → TW012 (al crearlo y al cambiar a bote)
  v_ok := false;
  begin
    insert into public.plans (couple_id, type, name, icon, start_date, end_date, default_split_mode)
    values (v_c, 'trip', 'Escapada', '🏖️', '2030-08-01', '2030-08-03', 'pot');
  exception when sqlstate 'TW012' then v_ok := true;
  end;
  assert v_ok, 'FALLO: un plan de bote con el bote apagado no da TW012';
  v_ok := false;
  begin
    update public.plans set default_split_mode = 'pot' where id = v_p4;
  exception when sqlstate 'TW012' then v_ok := true;
  end;
  assert v_ok, 'FALLO: cambiar un plan a bote con el bote apagado no da TW012';
  reset role;

  assert (select default_split_pct_m1 = 50 from public.plans where id = v_p3), 'FALLO: un plan a medias no guarda 50';
  assert (select end_date = '2030-08-29' from public.plans where id = v_p3), 'FALLO: el plan se alargó';
  assert (select default_split_mode = 'custom' and default_split_pct_m1 = 70 from public.plans where id = v_p4),
         'FALLO: el plan personalizado cambió';

  -- Con el bote activado (lo enciende el servidor en la pareja de prueba) sí; luego se apaga y el plan se sigue editando
  update public.couple_settings set pot_enabled = true where couple_id = v_c;
  set local role authenticated;
  insert into public.plans (id, couple_id, type, name, icon, start_date, end_date, default_split_mode, default_split_pct_m1)
  values (v_p5, v_c, 'trip', 'Escapada', '🏖️', '2030-08-01', '2030-08-03', 'pot', 40);
  reset role;
  update public.couple_settings set pot_enabled = false where couple_id = v_c;
  set local role authenticated;
  update public.plans set name = 'Escapada a la playa' where id = v_p5;
  reset role;

  assert (select default_split_mode = 'pot' and default_split_pct_m1 is null and name = 'Escapada a la playa'
          from public.plans where id = v_p5), 'FALLO: el plan de bote guarda % o no se pudo editar con el bote apagado';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B4. Tareas: sitio que ves (TW064); evento y gasto que ves y del mismo plan (TW060); plan fijo
do $$
declare
  v_c    constant uuid := '00000000-0000-4000-8000-0000000000fd';
  v_beto constant uuid := '00000000-0000-4000-8000-0000000000ee';
  v_p1   constant uuid := '00000000-0000-4000-8000-0000000c0001';
  v_p2   constant uuid := '00000000-0000-4000-8000-0000000c0002';
  v_e1   constant uuid := '00000000-0000-4000-8000-0000000c0101';  -- del plan P1
  v_e2   constant uuid := '00000000-0000-4000-8000-0000000c0102';  -- del plan P2
  v_e3   constant uuid := '00000000-0000-4000-8000-0000000c0103';  -- suelto
  v_es   constant uuid := '00000000-0000-4000-8000-0000000c0104';  -- secreto de Ana
  v_ps   constant uuid := '00000000-0000-4000-8000-0000000c0201';  -- sitio compartido
  v_pp   constant uuid := '00000000-0000-4000-8000-0000000c0202';  -- sitio privado de Ana
  v_xa   constant uuid := '00000000-0000-4000-8000-0000000c0301';  -- gasto compartido del plan P1
  v_xp   constant uuid := '00000000-0000-4000-8000-0000000c0302';  -- gasto privado de Ana (sin plan)
  v_xo   constant uuid := '00000000-0000-4000-8000-0000000c0305';  -- gasto compartido del plan P2
  v_xl   constant uuid := '00000000-0000-4000-8000-0000000c0306';  -- gasto compartido sin plan
  v_t1   constant uuid := '00000000-0000-4000-8000-0000000c0401';
  v_t2   constant uuid := '00000000-0000-4000-8000-0000000c0402';
  v_ok   boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ed","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.expenses (id, couple_id, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner, plan_id)
  values (v_xo, v_c, 'Vino', 2500, 'leisure', current_date, 'm1', 'half', true, v_p2);
  insert into public.expenses (id, couple_id, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner)
  values (v_xl, v_c, 'Súper', 1800, 'groceries', current_date, 'm1', 'half', true);
  -- Ana enlaza su propio sitio privado a una tarea (Beto verá la tarea sin sitio, como en eventos)
  insert into public.plan_tasks (couple_id, plan_id, title, place_id) values (v_c, v_p1, 'Recoger anillo', v_pp);

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ee","role":"authenticated"}', true);

  -- Sitio privado de Ana o inexistente → TW064
  v_ok := false;
  begin
    insert into public.plan_tasks (couple_id, plan_id, title, place_id) values (v_c, v_p1, 'Ir', v_pp);
  exception when sqlstate 'TW064' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Beto enlaza una tarea al sitio privado de Ana';
  v_ok := false;
  begin
    insert into public.plan_tasks (couple_id, plan_id, title, place_id) values (v_c, v_p1, 'Ir', gen_random_uuid());
  exception when sqlstate 'TW064' then v_ok := true;
  end;
  assert v_ok, 'FALLO: una tarea con un sitio inexistente no da TW064';

  -- Evento de otro plan, suelto o secreto de Ana → TW060
  v_ok := false;
  begin
    insert into public.plan_tasks (couple_id, plan_id, kind, title, event_id) values (v_c, v_p1, 'booking', 'Reservar', v_e2);
  exception when sqlstate 'TW060' then v_ok := true;
  end;
  assert v_ok, 'FALLO: una tarea enlaza un evento de otro plan';
  v_ok := false;
  begin
    insert into public.plan_tasks (couple_id, plan_id, kind, title, event_id) values (v_c, v_p1, 'booking', 'Reservar', v_e3);
  exception when sqlstate 'TW060' then v_ok := true;
  end;
  assert v_ok, 'FALLO: una tarea enlaza un evento suelto';
  v_ok := false;
  begin
    insert into public.plan_tasks (couple_id, plan_id, kind, title, event_id) values (v_c, v_p1, 'booking', 'Reservar', v_es);
  exception when sqlstate 'TW060' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Beto enlaza una tarea al evento secreto de Ana';

  -- Gasto privado de Ana, de otro plan o sin plan → TW060
  v_ok := false;
  begin
    insert into public.plan_tasks (couple_id, plan_id, kind, title, expense_id) values (v_c, v_p1, 'booking', 'Pagar', v_xp);
  exception when sqlstate 'TW060' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Beto enlaza una tarea al gasto privado de Ana';
  v_ok := false;
  begin
    insert into public.plan_tasks (couple_id, plan_id, kind, title, expense_id) values (v_c, v_p1, 'booking', 'Pagar', v_xo);
  exception when sqlstate 'TW060' then v_ok := true;
  end;
  assert v_ok, 'FALLO: una tarea enlaza un gasto de otro plan';
  v_ok := false;
  begin
    insert into public.plan_tasks (couple_id, plan_id, kind, title, expense_id) values (v_c, v_p1, 'booking', 'Pagar', v_xl);
  exception when sqlstate 'TW060' then v_ok := true;
  end;
  assert v_ok, 'FALLO: una tarea enlaza un gasto sin plan';

  -- Lo del mismo plan, sí; reintento con el mismo id no duplica
  insert into public.plan_tasks (id, couple_id, plan_id, kind, title, place_id, event_id, expense_id)
  values (v_t1, v_c, v_p1, 'booking', 'Billetes tranvía', v_ps, v_e1, v_xa);
  insert into public.plan_tasks (id, couple_id, plan_id, kind, title, place_id, event_id, expense_id)
  values (v_t1, v_c, v_p1, 'booking', 'Billetes tranvía', v_ps, v_e1, v_xa) on conflict (id) do nothing;
  insert into public.plan_tasks (id, couple_id, plan_id, title) values (v_t2, v_c, v_p1, 'Maleta');

  -- Cambiar el enlace a algo de otro plan → TW060; al sitio privado de Ana → TW064
  v_ok := false;
  begin
    update public.plan_tasks set event_id = v_e2 where id = v_t1;
  exception when sqlstate 'TW060' then v_ok := true;
  end;
  assert v_ok, 'FALLO: cambiar la tarea a un evento de otro plan';
  v_ok := false;
  begin
    update public.plan_tasks set expense_id = v_xo where id = v_t1;
  exception when sqlstate 'TW060' then v_ok := true;
  end;
  assert v_ok, 'FALLO: cambiar la tarea a un gasto de otro plan';
  v_ok := false;
  begin
    update public.plan_tasks set place_id = v_pp where id = v_t2;
  exception when sqlstate 'TW064' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Beto cambia una tarea al sitio privado de Ana';

  -- Mover la tarea a otro plan se ignora; marcarla hecha la firma Beto
  update public.plan_tasks set plan_id = v_p2, status = 'done' where id = v_t1;
  -- Editar la tarea de Ana con su sitio privado sin tocar el sitio sigue funcionando
  update public.plan_tasks set title = 'Recoger el anillo' where title = 'Recoger anillo';
  reset role;

  assert (select count(*) = 3 from public.plan_tasks where plan_id = v_p1), 'FALLO: número de tareas del plan';
  assert (select plan_id = v_p1 and event_id = v_e1 and expense_id = v_xa and place_id = v_ps
                 and status = 'done' and done_by = v_beto and version = 2
          from public.plan_tasks where id = v_t1), 'FALLO: la tarea cambió de plan o de enlaces, o no la firmó Beto';
  assert (select place_id = v_pp from public.plan_tasks where title = 'Recoger el anillo'),
         'FALLO: editar la tarea de Ana le quitó el sitio';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B5. Ideas: solo un sitio que ves (TW064)
do $$
declare
  v_c   constant uuid := '00000000-0000-4000-8000-0000000000fd';
  v_ps  constant uuid := '00000000-0000-4000-8000-0000000c0201';
  v_pp  constant uuid := '00000000-0000-4000-8000-0000000c0202';
  v_i1  constant uuid := '00000000-0000-4000-8000-0000000c0501';
  v_ok  boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ed","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.ideas (couple_id, title, type, place_id) values (v_c, 'Volver a la joyería', 'other', v_pp);

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ee","role":"authenticated"}', true);
  v_ok := false;
  begin
    insert into public.ideas (couple_id, title, type, place_id) values (v_c, 'Espiar', 'other', v_pp);
  exception when sqlstate 'TW064' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Beto apunta una idea al sitio privado de Ana';
  v_ok := false;
  begin
    insert into public.ideas (couple_id, title, type, place_id) values (v_c, 'Nada', 'other', gen_random_uuid());
  exception when sqlstate 'TW064' then v_ok := true;
  end;
  assert v_ok, 'FALLO: una idea con un sitio inexistente no da TW064';
  insert into public.ideas (id, couple_id, title, icon, type, place_id) values (v_i1, v_c, 'Atardecer', '🌅', 'trip', v_ps);
  v_ok := false;
  begin
    update public.ideas set place_id = v_pp where id = v_i1;
  exception when sqlstate 'TW064' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Beto cambia una idea al sitio privado de Ana';
  update public.ideas set title = 'Atardecer en Lisboa' where id = v_i1;
  reset role;

  assert (select place_id = v_ps and title = 'Atardecer en Lisboa' from public.ideas where id = v_i1),
         'FALLO: la idea de Beto cambió de sitio o no se pudo editar';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B6. Borrar un plan: pide aprobación; al aprobarlo se van itinerario y tareas; quedan gastos (con su nombre)
--     y la colección (como colección normal)
do $$
declare
  v_p1  constant uuid := '00000000-0000-4000-8000-0000000c0001';
  v_e1  constant uuid := '00000000-0000-4000-8000-0000000c0101';
  v_xa  constant uuid := '00000000-0000-4000-8000-0000000c0301';
  v_xb  constant uuid := '00000000-0000-4000-8000-0000000c0303';
  v_xp  constant uuid := '00000000-0000-4000-8000-0000000c0302';
  v_rq  constant uuid := '00000000-0000-4000-8000-0000000c0601';
  v_col uuid;
  v_r   jsonb;
begin
  select id into v_col from public.collections where plan_id = v_p1;
  assert v_col is not null, 'FALLO: el plan no tiene colección';
  -- Solo en la prueba: una fila creada en esta misma transacción hace que Postgres revise TODAS sus FK cuando la
  -- cascada del evento le pone event_id = null, y la del plan ya no existe. En producción las tareas se crean en
  -- otras transacciones y esa revisión no ocurre (los gastos sí la sufrían: lo arregla el §5 de la parte A).
  update public.plan_tasks set event_id = null where plan_id = v_p1;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ed","role":"authenticated"}', true);
  set local role authenticated;
  v_r := public.request_deletion(v_rq, 'plan', v_p1);
  assert v_r ->> 'status' = 'pending', 'FALLO: borrar un plan debe pedir aprobación (' || v_r::text || ')';

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ee","role":"authenticated"}', true);
  perform public.respond_deletion(v_rq, true);
  reset role;

  assert not exists (select 1 from public.plans where id = v_p1), 'FALLO: aprobado y el plan no se borró';
  assert not exists (select 1 from public.events where id = v_e1), 'FALLO: el itinerario sobrevive al plan';
  assert not exists (select 1 from public.plan_tasks where plan_id = v_p1), 'FALLO: las tareas sobreviven al plan';
  assert (select count(*) = 2 from public.expenses
          where id in (v_xa, v_xb) and plan_id is null and plan_name_snapshot = 'Lisboa' and plan_icon_snapshot = '✈️'),
         'FALLO: los gastos del plan no se conservaron con su nombre';
  assert (select event_id is null and event_title_snapshot = 'Tranvía 28' and visible_to_partner
          from public.expenses where id = v_xa), 'FALLO: el gasto del itinerario no guardó el nombre del evento';
  assert exists (select 1 from public.expenses where id = v_xp), 'FALLO: se borró el gasto privado del evento del plan';
  assert (select plan_id is null from public.collections where id = v_col), 'FALLO: la colección no quedó como normal';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B7. Final
do $$
begin
  raise notice 'PRUEBAS DE PLANIFICADOR (F1): todas correctas';
end $$;

rollback;
