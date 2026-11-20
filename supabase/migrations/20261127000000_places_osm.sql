-- =============================================================================
-- ito · Mapa, fase F4: sitios de OpenStreetMap (docs/plan-mapa.md §3 y F4)
--
-- Qué hace:
--   1. Añade 'osm' al enum place_provider (la búsqueda de Photon devuelve ids de OSM: «N123», «W45», «R6»).
--   2. CHECK: un sitio de proveedor (google u osm) lleva provider_place_id; uno a mano (manual), no.
--      Sustituye a places_check (provider = 'google' ⇔ provider_place_id no nulo).
--   3. Índices únicos con el proveedor: (couple_id, provider, provider_place_id) para compartidos y
--      (couple_id, created_by, provider, provider_place_id) para privados. Así un id de un proveedor no choca
--      con el mismo texto de otro. Mismos nombres que en 20261126000000_mapa.sql (si se vuelve a ejecutar esa,
--      su «create … if not exists» no los toca). Se rehacen sin riesgo: places tenía 0 filas (2026-11-20) y
--      los nuevos son más permisivos que los anteriores.
--
-- Requiere 20261126000000_mapa.sql.
-- Es idempotente. Tres bloques:
--   A1 · añade el valor del enum y hace COMMIT: un valor nuevo de enum no se puede usar en la misma transacción
--        en la que se añade (ni en un CHECK), así que no puede ir junto al resto.
--   A2 · CHECK e índices, en otra transacción.
--   B  · pruebas que acaban en ROLLBACK.
-- Funciona entero en el SQL Editor o con `supabase db query --remote -f`: los COMMIT explícitos separan
-- las transacciones aunque todo vaya en un único mensaje.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A1. Valor nuevo del enum (transacción propia)
-- -----------------------------------------------------------------------------
begin;
alter type public.place_provider add value if not exists 'osm';
commit;

-- -----------------------------------------------------------------------------
-- A2. CHECK e índices
-- -----------------------------------------------------------------------------
begin;

do $$
begin
  if to_regclass('public.places_google_compartido_uidx') is null
     and to_regclass('public.places_provider_uidx') is not null then
    raise exception 'Aplica antes 20261126000000_mapa.sql';
  end if;
end $$;

-- 2. Proveedor ⇔ id del proveedor
alter table public.places drop constraint if exists places_check;
alter table public.places drop constraint if exists places_provider_check;
alter table public.places add constraint places_provider_check
  check ((provider in ('google', 'osm')) = (provider_place_id is not null));

-- 3. Índices únicos con el proveedor (dentro de la transacción: nunca hay un momento sin índice)
drop index if exists public.places_google_compartido_uidx;
drop index if exists public.places_google_privado_uidx;
create unique index places_google_compartido_uidx on public.places (couple_id, provider, provider_place_id)
  where provider_place_id is not null and visible_to_partner;
create unique index places_google_privado_uidx on public.places (couple_id, created_by, provider, provider_place_id)
  where provider_place_id is not null and not visible_to_partner;

commit;

-- =============================================================================
-- PARTE B · Pruebas (no dejan nada: todo acaba en ROLLBACK). Ejecutar como postgres.
-- Si una prueba falla, el script se detiene con «FALLO: ...» y la parte A ya está aplicada.
-- Escrituras «de la app» con set local role authenticated y auth.uid() simulado (se aplican la RLS y los triggers).
-- No cambia la estructura de ninguna tabla ni toca filas reales: solo una pareja y dos usuarios de prueba.
--   Ana (…0000000000e5, m1) y Beto (…0000000000e6, m2).
-- =============================================================================
begin;
set local idle_in_transaction_session_timeout = '60s';

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000e5', 'osm-a@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000e6', 'osm-b@prueba.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-0000000000e5', 'Ana'),
  ('00000000-0000-4000-8000-0000000000e6', 'Beto')
on conflict (id) do update set display_name = excluded.display_name;
insert into public.couples (id) values ('00000000-0000-4000-8000-0000000000f5');
insert into public.couple_settings (couple_id) values ('00000000-0000-4000-8000-0000000000f5') on conflict do nothing;
insert into public.couple_members (couple_id, user_id, slot) values
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000e5', 'm1'),
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-0000000000e6', 'm2');

-- B1. Estructura
do $$
begin
  assert exists (select 1 from pg_enum where enumtypid = 'public.place_provider'::regtype and enumlabel = 'osm'),
         'FALLO: place_provider no tiene osm';
  assert not exists (select 1 from pg_constraint where conrelid = 'public.places'::regclass and conname = 'places_check'),
         'FALLO: sigue el CHECK antiguo places_check';
  assert exists (select 1 from pg_constraint where conrelid = 'public.places'::regclass and conname = 'places_provider_check'),
         'FALLO: falta el CHECK places_provider_check';
  assert (select pg_get_indexdef('public.places_google_compartido_uidx'::regclass) like '%(couple_id, provider, provider_place_id)%'),
         'FALLO: places_google_compartido_uidx no incluye provider';
  assert (select pg_get_indexdef('public.places_google_privado_uidx'::regclass) like '%(couple_id, created_by, provider, provider_place_id)%'),
         'FALLO: places_google_privado_uidx no incluye provider';
end $$;

-- B2. CHECK: proveedor ⇔ id
do $$
declare
  v_c  constant uuid := '00000000-0000-4000-8000-0000000000f5';
  v_ok boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);
  set local role authenticated;

  -- osm con id y manual sin id: bien
  insert into public.places (couple_id, name, lat, lng, provider, provider_place_id) values
    (v_c, 'Casa Lola', 40.41, -3.70, 'osm', 'N900001'),
    (v_c, 'Mirador', 40.42, -3.71, 'manual', null);

  -- osm sin id → 23514
  v_ok := false;
  begin
    insert into public.places (couple_id, name, lat, lng, provider, provider_place_id) values (v_c, 'X', 40, -3, 'osm', null);
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: un sitio osm sin provider_place_id se guarda';

  -- manual con id → 23514
  v_ok := false;
  begin
    insert into public.places (couple_id, name, lat, lng, provider, provider_place_id) values (v_c, 'X', 40, -3, 'manual', 'N900002');
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: un sitio manual con provider_place_id se guarda';

  -- google sin id → 23514 (como antes)
  v_ok := false;
  begin
    insert into public.places (couple_id, name, lat, lng, provider, provider_place_id) values (v_c, 'X', 40, -3, 'google', null);
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: un sitio google sin provider_place_id se guarda';
  reset role;
end $$;

-- B3. Duplicados de osm: mismas reglas que Google y sin chocar entre proveedores
do $$
declare
  v_c  constant uuid := '00000000-0000-4000-8000-0000000000f5';
  v_ap constant uuid := '00000000-0000-4000-8000-00000000a501';  -- privado de Ana
  v_n  integer;
  v_ok boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.places (id, couple_id, name, lat, lng, provider, provider_place_id, visible_to_partner)
  values (v_ap, v_c, 'Taberna Sorpresa', 40.41, -3.70, 'osm', 'N900010', false);

  -- Beto lo guarda compartido y también en privado: conviven con el privado de Ana
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e6","role":"authenticated"}', true);
  insert into public.places (couple_id, name, lat, lng, provider, provider_place_id, visible_to_partner) values
    (v_c, 'Taberna', 40.41, -3.70, 'osm', 'N900010', true),
    (v_c, 'Taberna (mía)', 40.41, -3.70, 'osm', 'N900010', false);
  select count(*) into v_n from public.places where provider_place_id = 'N900010';
  assert v_n = 2, 'FALLO: Beto ve ' || v_n || ' sitios con ese id (debe ver solo los suyos)';

  -- El mismo texto de id en otro proveedor no choca
  insert into public.places (couple_id, name, lat, lng, provider, provider_place_id, visible_to_partner)
  values (v_c, 'Otro proveedor', 40.41, -3.70, 'google', 'N900010', true);

  -- Dos compartidos osm iguales → 23505
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated"}', true);
  v_ok := false;
  begin
    insert into public.places (couple_id, name, lat, lng, provider, provider_place_id, visible_to_partner)
    values (v_c, 'Taberna otra vez', 40.41, -3.70, 'osm', 'N900010', true);
  exception when unique_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: dos sitios osm compartidos con el mismo id no chocan';

  -- Dos privados osm iguales de la misma persona → 23505
  v_ok := false;
  begin
    insert into public.places (couple_id, name, lat, lng, provider, provider_place_id, visible_to_partner)
    values (v_c, 'Taberna privada 2', 40.41, -3.70, 'osm', 'N900010', false);
  exception when unique_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: dos privados osm de la misma persona con el mismo id no chocan';

  -- Revelar el privado de Ana cuando ya hay un compartido igual → 23505
  v_ok := false;
  begin
    update public.places set visible_to_partner = true where id = v_ap;
  exception when unique_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: revelar un privado osm con un compartido igual no da 23505';
  reset role;

  assert (select not visible_to_partner from public.places where id = v_ap), 'FALLO: el privado de Ana se reveló';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B4. Final
do $$
begin
  raise notice 'PRUEBAS DE PLACES OSM: todas correctas';
end $$;

rollback;
