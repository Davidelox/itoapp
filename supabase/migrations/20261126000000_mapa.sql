-- =============================================================================
-- ito · Mapa, fase F1: seguridad de los sitios (docs/plan-mapa.md §4)
--
-- Qué hace:
--   1. Duplicados con sitios privados: el índice único (couple_id, provider_place_id) hacía fallar a la pareja
--      al guardar un sitio de Google que la otra persona tenía en privado (y le revelaba que existía). Se parte en
--      dos: compartidos únicos por pareja; privados únicos por pareja y persona. Revelar un privado que ya está
--      compartido da 23505 (la app dice «Ya está en vuestro mapa» y abre el compartido).
--   2. Un sitio compartido no se vuelve privado (TW053, como TW051 en eventos): la pareja lo tiene en caché,
--      Realtime no le avisaría y sus eventos/gastos perderían el sitio. Revelar un privado sí se puede.
--      Se aplica siempre (cliente y servidor), igual que TW051.
--   3. Solo se enlaza un sitio que ves (TW064): expenses_before_write y events_before_write rechazan un place_id
--      nuevo o cambiado que quien escribe no puede leer (el sitio privado de la pareja o uno inexistente). Las dos
--      funciones son security invoker: el exists aplica la RLS de places de quien escribe.
--   4. Al borrar un sitio privado, su nombre solo se copia (place_name_snapshot) en gastos que la pareja no ve.
--
-- Códigos: TW052 y TW060 ya estaban usados (rango del calendario / «no encontrado» genérico, que la app traduce
-- como «Este gasto ya no existe»), así que se usan TW053 y TW064.
--
-- Requiere 20261121000000_calendario_v2.sql (y por tanto 20261120000000_calendario.sql: events_before_write
-- parte de su definición, con la zona horaria de la pareja).
-- Es idempotente: se puede ejecutar más de una vez. La parte A (cambios) va en una transacción propia
-- y la parte B (pruebas) acaba en ROLLBACK sin deshacer la parte A.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Requisitos
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'events' and column_name = 'category') then
    raise exception 'Aplica antes 20261121000000_calendario_v2.sql';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Índices únicos de Google: compartidos por pareja, privados por persona
--    Los nuevos son más permisivos que el anterior: ninguna fila que cumplía el viejo los incumple.
-- -----------------------------------------------------------------------------
create unique index if not exists places_google_compartido_uidx on public.places (couple_id, provider_place_id)
  where provider_place_id is not null and visible_to_partner;
create unique index if not exists places_google_privado_uidx on public.places (couple_id, created_by, provider_place_id)
  where provider_place_id is not null and not visible_to_partner;
drop index if exists public.places_provider_uidx;

-- -----------------------------------------------------------------------------
-- 2. Un sitio compartido no se vuelve privado (TW053)
--    Va después de a_guard (TW013: solo quien lo creó cambia la visibilidad) y antes de z_touch.
-- -----------------------------------------------------------------------------
create or replace function private.places_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.visible_to_partner and not new.visible_to_partner then
    raise exception 'Un sitio compartido no puede volver a ser privado' using errcode = 'TW053';
  end if;
  return new;
end $$;

drop trigger if exists b_rules on public.places;
create trigger b_rules before update on public.places
  for each row when (old.visible_to_partner and not new.visible_to_partner)
  execute function private.places_before_update();

-- -----------------------------------------------------------------------------
-- 3a. Gastos: solo se enlaza un sitio que ves (TW064)
--     Cuerpo idéntico al de 20261113000000_esquema_inicial.sql salvo el bloque marcado.
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
  if new.event_id is not null and new.plan_id is null
     and (tg_op = 'INSERT' or new.event_id is distinct from old.event_id) then
    select e.plan_id into new.plan_id from public.events e where e.id = new.event_id;
  end if;

  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 3b. Eventos: solo se enlaza un sitio que ves (TW064)
--     Cuerpo idéntico al de 20261120000000_calendario.sql §2 salvo el bloque marcado.
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

  -- [Mapa F1] Solo se puede enlazar un sitio que quien escribe puede ver (no el sitio privado de la pareja).
  if private.is_client_write() and new.place_id is not null
     and (tg_op = 'INSERT' or new.place_id is distinct from old.place_id)
     and not exists (select 1 from public.places p where p.id = new.place_id) then
    raise exception 'Sitio no encontrado' using errcode = 'TW064';
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Etiqueta al borrar: el nombre de un sitio privado solo se copia en gastos que la pareja no ve
--    (como ya se hacía con el título de un evento secreto).
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
    update public.expenses set plan_name_snapshot = old.name, plan_icon_snapshot = old.icon where plan_id = old.id;
  end if;
  return old;
end $$;

-- -----------------------------------------------------------------------------
-- 5. Permisos explícitos: las funciones de trigger no se conceden a nadie
--    (los triggers no comprueban EXECUTE al dispararse).
-- -----------------------------------------------------------------------------
revoke all on function private.places_before_update()   from public, anon, authenticated;
revoke all on function private.expenses_before_write()  from public, anon, authenticated;
revoke all on function private.events_before_write()    from public, anon, authenticated;
revoke all on function private.snapshot_before_delete() from public, anon, authenticated;

commit;

-- =============================================================================
-- PARTE B · Pruebas (no dejan nada: todo acaba en ROLLBACK). Ejecutar como postgres.
-- Si una prueba falla, el script se detiene con «FALLO: ...» y la parte A ya está aplicada.
-- Las escrituras «de la app» van con set local role authenticated y auth.uid() simulado con request.jwt.claims
-- (así se aplican la RLS y private.is_client_write()); las comprobaciones, como postgres.
-- No cambia la estructura de ninguna tabla ni toca filas reales: solo una pareja y dos usuarios de prueba.
--   Ana  (…0000000000e1, m1) hace de David; Beto (…0000000000e2, m2) hace de María.
-- =============================================================================
begin;
set local idle_in_transaction_session_timeout = '60s';

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000e1', 'mapa-a@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e2', 'mapa-b@prueba.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-0000000000e1', 'Ana'),
  ('00000000-0000-4000-8000-0000000000e2', 'Beto')
on conflict (id) do update set display_name = excluded.display_name;
insert into public.couples (id) values ('00000000-0000-4000-8000-0000000000f1');
insert into public.couple_settings (couple_id) values ('00000000-0000-4000-8000-0000000000f1') on conflict do nothing;
insert into public.couple_members (couple_id, user_id, slot) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', 'm1'),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e2', 'm2');

-- B1. Estructura: índices y trigger
do $$
begin
  assert to_regclass('public.places_provider_uidx') is null, 'FALLO: sigue el índice places_provider_uidx';
  assert to_regclass('public.places_google_compartido_uidx') is not null, 'FALLO: falta places_google_compartido_uidx';
  assert to_regclass('public.places_google_privado_uidx') is not null, 'FALLO: falta places_google_privado_uidx';
  assert exists (select 1 from pg_trigger where not tgisinternal and tgname = 'b_rules' and tgrelid = 'public.places'::regclass),
         'FALLO: falta el trigger b_rules en places';
  assert not has_function_privilege('authenticated', 'private.places_before_update()', 'execute'),
         'FALLO: authenticated ejecuta private.places_before_update()';
  assert not (select prosecdef from pg_proc where oid = 'private.events_before_write()'::regprocedure),
         'FALLO: events_before_write debe ser security invoker (la RLS de places decide TW064)';
  assert not (select prosecdef from pg_proc where oid = 'private.expenses_before_write()'::regprocedure),
         'FALLO: expenses_before_write debe ser security invoker (la RLS de places decide TW064)';
end $$;

-- B2. Duplicados de Google: privado de Ana y compartido de Beto conviven; dos compartidos chocan; revelar choca
do $$
declare
  v_c   constant uuid := '00000000-0000-4000-8000-0000000000f1';
  v_ap  constant uuid := '00000000-0000-4000-8000-00000000a001';  -- privado de Ana
  v_bs  constant uuid := '00000000-0000-4000-8000-00000000a002';  -- compartido de Beto
  v_bp  constant uuid := '00000000-0000-4000-8000-00000000a003';  -- privado de Beto (mismo sitio)
  v_n   integer;
  v_ok  boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.places (id, couple_id, name, lat, lng, provider, provider_place_id, visible_to_partner)
  values (v_ap, v_c, 'Taberna Sorpresa', 40.41, -3.70, 'google', 'ChIJprueba_mapa_1', false);

  -- Beto guarda el mismo sitio compartido: no falla ni descubre el privado de Ana
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
  insert into public.places (id, couple_id, name, lat, lng, provider, provider_place_id, visible_to_partner)
  values (v_bs, v_c, 'Taberna', 40.41, -3.70, 'google', 'ChIJprueba_mapa_1', true);
  select count(*) into v_n from public.places where provider_place_id = 'ChIJprueba_mapa_1';
  assert v_n = 1, 'FALLO: Beto ve ' || v_n || ' sitios con ese place_id (debe ver solo el suyo)';

  -- y también en privado (cada uno su privado)
  insert into public.places (id, couple_id, name, lat, lng, provider, provider_place_id, visible_to_partner)
  values (v_bp, v_c, 'Taberna (mía)', 40.41, -3.70, 'google', 'ChIJprueba_mapa_1', false);

  -- Ana no puede guardarlo compartido otra vez: ya está en vuestro mapa (23505)
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
  v_ok := false;
  begin
    insert into public.places (couple_id, name, lat, lng, provider, provider_place_id, visible_to_partner)
    values (v_c, 'Taberna otra vez', 40.41, -3.70, 'google', 'ChIJprueba_mapa_1', true);
  exception when unique_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: dos sitios compartidos con el mismo place_id no chocan';

  -- Ana tampoco puede tener dos privados iguales
  v_ok := false;
  begin
    insert into public.places (couple_id, name, lat, lng, provider, provider_place_id, visible_to_partner)
    values (v_c, 'Taberna privada 2', 40.41, -3.70, 'google', 'ChIJprueba_mapa_1', false);
  exception when unique_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: dos privados de la misma persona con el mismo place_id no chocan';

  -- Revelar el privado de Ana cuando ya hay un compartido igual → 23505
  v_ok := false;
  begin
    update public.places set visible_to_partner = true where id = v_ap;
  exception when unique_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: revelar un privado con un compartido igual no da 23505';
  reset role;

  assert (select not visible_to_partner from public.places where id = v_ap), 'FALLO: el privado de Ana se reveló';
end $$;

-- B3. Un sitio compartido no se vuelve privado (TW053); revelar un privado sí se puede
do $$
declare
  v_c   constant uuid := '00000000-0000-4000-8000-0000000000f1';
  v_as  constant uuid := '00000000-0000-4000-8000-00000000a011';  -- compartido de Ana
  v_ap  constant uuid := '00000000-0000-4000-8000-00000000a012';  -- privado de Ana (a mano)
  v_ok  boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.places (id, couple_id, name, lat, lng, provider, visible_to_partner) values
    (v_as, v_c, 'Mirador', 40.42, -3.71, 'manual', true),
    (v_ap, v_c, 'Regalo', 40.43, -3.72, 'manual', false);

  -- la dueña intenta ocultar el compartido → TW053
  v_ok := false;
  begin
    update public.places set visible_to_partner = false where id = v_as;
  exception when sqlstate 'TW053' then v_ok := true;
  end;
  assert v_ok, 'FALLO: ocultar un sitio compartido no da TW053';

  -- revelar un privado sí
  update public.places set visible_to_partner = true where id = v_ap;

  -- la pareja no puede cambiar la visibilidad (TW013, a_guard va antes)
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
  v_ok := false;
  begin
    update public.places set visible_to_partner = false where id = v_as;
  exception when sqlstate 'TW013' then v_ok := true;
  end;
  assert v_ok, 'FALLO: la pareja cambia la visibilidad de un sitio que no creó';

  -- editar otras columnas de un compartido sigue funcionando
  update public.places set status = 'been' where id = v_as;
  reset role;

  assert (select visible_to_partner from public.places where id = v_ap), 'FALLO: no se pudo revelar un sitio privado';
  assert (select visible_to_partner and status = 'been' from public.places where id = v_as),
         'FALLO: el sitio compartido cambió de visibilidad o no se pudo editar';

  -- tampoco desde el servidor (como TW051)
  v_ok := false;
  begin
    update public.places set visible_to_partner = false where id = v_as;
  exception when sqlstate 'TW053' then v_ok := true;
  end;
  assert v_ok, 'FALLO: el servidor puede ocultar un sitio compartido';
end $$;

-- B4. Solo se enlaza un sitio que ves (TW064) en gastos y eventos
do $$
declare
  v_c   constant uuid := '00000000-0000-4000-8000-0000000000f1';
  v_ap  constant uuid := '00000000-0000-4000-8000-00000000a021';  -- privado de Ana
  v_as  constant uuid := '00000000-0000-4000-8000-00000000a022';  -- compartido de Ana
  v_be  constant uuid := '00000000-0000-4000-8000-00000000b021';  -- gasto de Beto
  v_ev  constant uuid := '00000000-0000-4000-8000-00000000c021';  -- evento de Ana, compartido
  v_ok  boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.places (id, couple_id, name, lat, lng, provider, visible_to_partner) values
    (v_ap, v_c, 'Joyería', 40.44, -3.73, 'manual', false),
    (v_as, v_c, 'Parque', 40.45, -3.74, 'manual', true);
  insert into public.events (id, couple_id, title, start_date) values (v_ev, v_c, 'Paseo', '2030-05-01');

  -- Ana sí enlaza su propio sitio privado (la app avisa de que Beto no lo verá)
  insert into public.expenses (couple_id, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner, place_id)
  values (v_c, 'Anillo', 9000, 'leisure', current_date, 'm1', 'only_m1', false, v_ap);
  insert into public.events (couple_id, title, start_date, is_secret, place_id) values (v_c, 'Recoger anillo', '2030-05-02', true, v_ap);

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);

  -- Beto: gasto nuevo con el sitio privado de Ana → TW064
  v_ok := false;
  begin
    insert into public.expenses (couple_id, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner, place_id)
    values (v_c, 'Cena', 4000, 'leisure', current_date, 'm2', 'half', true, v_ap);
  exception when sqlstate 'TW064' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Beto enlaza un gasto nuevo al sitio privado de Ana';

  -- Beto: gasto con sitio compartido, y después lo cambia al privado de Ana → TW064
  insert into public.expenses (id, couple_id, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner, place_id)
  values (v_be, v_c, 'Helado', 600, 'leisure', current_date, 'm2', 'half', true, v_as);
  v_ok := false;
  begin
    update public.expenses set place_id = v_ap where id = v_be;
  exception when sqlstate 'TW064' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Beto cambia su gasto al sitio privado de Ana';

  -- Un sitio que no existe también da TW064 (no 23503, que distinguiría «no existe» de «es privado»)
  v_ok := false;
  begin
    update public.expenses set place_id = gen_random_uuid() where id = v_be;
  exception when sqlstate 'TW064' then v_ok := true;
  end;
  assert v_ok, 'FALLO: un sitio inexistente en un gasto no da TW064';

  -- Editar el gasto sin tocar el sitio sigue funcionando
  update public.expenses set concept = 'Helados' where id = v_be;

  -- Beto: evento nuevo con el sitio privado de Ana → TW064
  v_ok := false;
  begin
    insert into public.events (couple_id, title, start_date, place_id) values (v_c, 'Visita', '2030-05-03', v_ap);
  exception when sqlstate 'TW064' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Beto enlaza un evento nuevo al sitio privado de Ana';

  -- Beto edita el evento compartido de Ana y le pone el sitio privado de Ana → TW064; el compartido, sí
  v_ok := false;
  begin
    update public.events set place_id = v_ap where id = v_ev;
  exception when sqlstate 'TW064' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Beto pone el sitio privado de Ana en un evento compartido';
  update public.events set place_id = v_as where id = v_ev;
  reset role;

  assert (select place_id = v_as and concept = 'Helados' from public.expenses where id = v_be), 'FALLO: el gasto de Beto cambió de sitio';
  assert (select place_id = v_as from public.events where id = v_ev), 'FALLO: no se pudo poner el sitio compartido en el evento';
end $$;

-- B5. Borrar sitios: privado → al momento y sin copiar su nombre en gastos compartidos; compartido → aprobación
do $$
declare
  v_c   constant uuid := '00000000-0000-4000-8000-0000000000f1';
  v_ap  constant uuid := '00000000-0000-4000-8000-00000000a031';  -- privado de Ana
  v_as  constant uuid := '00000000-0000-4000-8000-00000000a032';  -- compartido de Ana
  v_e1  constant uuid := '00000000-0000-4000-8000-00000000b031';  -- gasto compartido con el sitio privado
  v_e2  constant uuid := '00000000-0000-4000-8000-00000000b032';  -- gasto privado con el sitio privado
  v_e3  constant uuid := '00000000-0000-4000-8000-00000000b033';  -- gasto compartido con el sitio compartido
  v_r   jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.places (id, couple_id, name, lat, lng, provider, visible_to_partner) values
    (v_ap, v_c, 'Floristería secreta', 40.46, -3.75, 'manual', false),
    (v_as, v_c, 'Bar Pepe', 40.47, -3.76, 'manual', true);
  insert into public.expenses (id, couple_id, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner, place_id) values
    (v_e1, v_c, 'Cena juntos', 5000, 'leisure', current_date, 'm1', 'half', true, v_ap),
    (v_e2, v_c, 'Flores', 2500, 'leisure', current_date, 'm1', 'only_m1', false, v_ap),
    (v_e3, v_c, 'Cañas', 1200, 'leisure', current_date, 'm1', 'half', true, v_as);

  v_r := public.request_deletion(gen_random_uuid(), 'place', v_ap);
  assert v_r ->> 'status' = 'deleted', 'FALLO: borrar un sitio privado debe ser al momento (' || v_r::text || ')';

  v_r := public.request_deletion(gen_random_uuid(), 'place', v_as);
  assert v_r ->> 'status' = 'pending', 'FALLO: borrar un sitio compartido debe pedir aprobación (' || v_r::text || ')';
  reset role;

  assert not exists (select 1 from public.places where id = v_ap), 'FALLO: el sitio privado no se borró';
  assert (select place_id is null and place_name_snapshot is null from public.expenses where id = v_e1),
         'FALLO: el nombre del sitio privado se copió en un gasto compartido';
  assert (select place_id is null and place_name_snapshot = 'Floristería secreta' from public.expenses where id = v_e2),
         'FALLO: el gasto privado no guardó el nombre del sitio privado';
  assert exists (select 1 from public.places where id = v_as), 'FALLO: el sitio compartido se borró sin aprobación';

  -- Beto también lo pide → se borra y el gasto compartido guarda el nombre
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated"}', true);
  set local role authenticated;
  v_r := public.request_deletion(gen_random_uuid(), 'place', v_as);
  reset role;
  assert v_r ->> 'status' = 'deleted', 'FALLO: con los dos de acuerdo el sitio compartido no se borra (' || v_r::text || ')';
  assert (select place_id is null and place_name_snapshot = 'Bar Pepe' from public.expenses where id = v_e3),
         'FALLO: el gasto compartido no guardó el nombre del sitio compartido';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B6. Final
do $$
begin
  raise notice 'PRUEBAS DE MAPA (F1): todas correctas';
end $$;

rollback;
