-- =============================================================================
-- ito · Fechas de visita de los sitios y reserva de los eventos
-- (docs/modelo-datos.md §3, §5, §6 y §13; docs/plan-mapa.md §12 y §13)
--
-- Qué hace:
--   A. Visitas (tabla nueva public.place_visits): cada fecha en la que habéis ido a un sitio, varias por sitio.
--      - Una fila = un día. Como mucho una visita por sitio y día (unique place_id + visited_on): dos «Hemos ido» a la
--        vez, o un reintento con otro id, no la duplican (23505).
--      - Visibilidad heredada del sitio (como place_notes): la ve quien ve el sitio. Las visitas de un sitio privado
--        solo las ve su dueño; si lo revela, la pareja las ve. Se borran con el sitio (FK en cascada).
--      - Escritura directa por la API, sin RPC. Los dos añaden, corrigen y borran cualquier visita de un sitio que ven,
--        sin aprobación: una visita es una fecha vuestra (no una opinión de una persona como place_notes) y quitarla es
--        editar un dato del sitio, no borrar algo compartido (§6, como tareas, notas y excepciones de eventos).
--      - Añadir una visita pone el sitio en «Hemos ido» (trigger y_status). Quitar visitas no cambia el estado, y un
--        sitio puede estar en «Hemos ido» sin visitas («sin fecha»): no se inventan fechas para los que ya lo estaban.
--      - place_stats: visit_count sale SOLO de place_visits (antes: fechas distintas de gastos y eventos pasados del
--        sitio). Así no hay doble conteo ni visitas que no se pueden quitar del historial. Columnas nuevas al final:
--        last_visit_on (última visita) y suggested_visit_on (la fecha más reciente de un evento pasado o un gasto del
--        sitio posterior a la última visita: «¿Fuisteis el vie 14? Añadir visita»).
--   B. Reserva en events: reserved boolean not null default false y reservation_note text (≤ 200), p. ej. «a nombre
--      de David, 21:30». Columnas libres: los permisos de events son de tabla (sin permisos por columna) y la guarda
--      events_before_write no necesita nada (se ha comparado con la definición de producción, 2026-11-20: no se toca).
--      El itinerario del Planificador son eventos con plan_id, así que también lo cubre; las reservas por hacer de un
--      plan ya existen como plan_tasks.kind = 'booking' (status pending/done): no se añade nada ahí.
--      calendar_range NO cambia: añadir una columna a su salida exige drop + create de una función grande que usan el
--      calendario, el Inicio y la agenda (riesgo de copiarla mal y de perder permisos). La reserva se lee de events en
--      el detalle y el formulario del evento (COLUMNAS_EVENTO). Si un día la fila del calendario debe llevar el icono
--      de «Reservado», se amplía calendar_range en su propia migración.
--
-- Contrato para la app:
--   · Visitas (tabla public.place_visits, Realtime con filtro couple_id=eq.<id>; un DELETE llega solo con el id):
--       columnas: id (uuid de la app), couple_id, place_id, visited_on (date), note (≤ 200 o null), created_by,
--                 version, created_at, updated_at.
--       Leer el historial: from('place_visits').select('id, visited_on, note, created_by, version')
--                          .eq('place_id', id).order('visited_on', { ascending: false }).
--       Añadir: upsert({ id, couple_id, place_id, visited_on, note }, { onConflict: 'id', ignoreDuplicates: true }).
--               El servidor fija created_by y pone el sitio en «Hemos ido» si estaba en «Quiero ir»: eso sube
--               places.version, así que después hay que recargar el sitio (o esperar a Realtime) antes de editarlo.
--       Marcar «Hemos ido» en la ficha = añadir una visita con hoy por defecto (editable). Pasar a «Quiero ir» es
--               update de places.status; las visitas se quedan.
--       Corregir: update({ visited_on, note }).eq('id', id).eq('version', v) (0 filas → la pareja la cambió o la
--               borró: recargar). place_id y couple_id no cambian (el servidor ignora lo que se mande).
--       Quitar: delete().eq('id', id). Directo, sin request_deletion.
--       Último lugar visitado (Inicio): from('place_visits').select('place_id, visited_on')
--               .order('visited_on', { ascending: false }).order('created_at', { ascending: false }).limit(1)
--               (la RLS ya oculta los sitios privados de la pareja). Sin visitas: «sin fecha».
--     Errores: 23505 ya hay una visita ese día · TW065 fecha futura (más de un día por delante del «hoy» de la pareja,
--              para no fallar viajando a otra zona horaria) · TW064 el sitio no existe o no lo ves ·
--              23514 fecha anterior a 1950 o nota de más de 200 caracteres (la app ya lo impide).
--   · place_stats (vista security_invoker; mismas columnas y en el mismo orden, más dos al final):
--       place_id, couple_id, visit_count (integer: nº de visitas apuntadas), total_spent_cents, next_event_on,
--       last_visit_on (date | null), suggested_visit_on (date | null).
--       La ficha: «3 visitas · última el 14 nov» con visit_count/last_visit_on; si suggested_visit_on no es null,
--       ofrecer «¿Fuisteis el <fecha>? Añadir visita» (inserta una visita en esa fecha). Sustituye a la sugerencia
--       «¿Ya habéis ido?» basada en visit_count > 0, que ya no aplica (con visitas el sitio está en «Hemos ido»).
--   · Reserva: events.reserved (boolean, por defecto false) y events.reservation_note (text ≤ 200 o null; la app
--       manda null si está vacía y al desmarcar la reserva). Se escriben con el insert/update normal del evento;
--       añadir 'reserved, reservation_note' a COLUMNAS_EVENTO DESPUÉS de aplicar esta migración (antes, 42703).
--       Error: 23514 nota de más de 200 caracteres.
--
-- Códigos: TW065 nuevo (fecha de visita futura). TW064 se reutiliza (mismo significado que en gastos y eventos).
-- Requiere 20261128000000_colecciones_borrado.sql (y por tanto 20261126000000_mapa.sql).
-- Idempotente. La parte A (cambios) va en su transacción y la parte B (pruebas) acaba en ROLLBACK.
-- Funciona entero en el SQL Editor o con `supabase db query --remote -f`.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. Requisitos
-- -----------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.preview_collection_deletion(uuid)') is null then
    raise exception 'Aplica antes 20261128000000_colecciones_borrado.sql';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 1. Tabla de visitas
-- -----------------------------------------------------------------------------
create table if not exists public.place_visits (
  id         uuid primary key default gen_random_uuid(),     -- lo genera la app (alta idempotente)
  couple_id  uuid not null,
  place_id   uuid not null,
  visited_on date not null constraint place_visits_visited_on_check check (visited_on >= date '1950-01-01'),
  note       text constraint place_visits_note_check check (char_length(note) <= 200),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  version    integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Una visita por sitio y día. También sirve de índice para el historial, el recuento y la última visita.
  constraint place_visits_place_day_key unique (place_id, visited_on),
  -- FK compuesta: imposible apuntar una visita a un sitio de otra pareja. Se van con el sitio.
  constraint place_visits_place_fkey foreign key (couple_id, place_id)
    references public.places (couple_id, id) on delete cascade
);
create index if not exists place_visits_couple_idx on public.place_visits (couple_id, visited_on desc);
create index if not exists place_visits_created_by_idx on public.place_visits (created_by);

alter table public.place_visits enable row level security;

-- -----------------------------------------------------------------------------
-- 2. Triggers de visitas (orden: a_guard → b_rules → z_touch; y_status después de insertar)
-- -----------------------------------------------------------------------------

-- Reglas: el sitio tiene que verse (TW064, como en gastos y eventos), la fecha no puede ser futura (TW065) y una
-- visita no cambia de sitio ni de pareja. security invoker: el exists aplica la RLS de places de quien escribe.
create or replace function private.place_visits_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_today date;
begin
  if tg_op = 'UPDATE' then
    new.couple_id := old.couple_id;
    new.place_id  := old.place_id;
  elsif private.is_client_write()
        and not exists (select 1 from public.places p where p.id = new.place_id) then
    raise exception 'Sitio no encontrado' using errcode = 'TW064';
  end if;

  new.note := nullif(btrim(new.note), '');

  -- «Hoy» de la pareja, con un día de margen (quien viaja a una zona por delante de la de la pareja).
  if tg_op = 'INSERT' or new.visited_on is distinct from old.visited_on then
    select (now() at time zone c.time_zone)::date into v_today from public.couples c where c.id = new.couple_id;
    if new.visited_on > coalesce(v_today, current_date) + 1 then
      raise exception 'La fecha de la visita no puede ser futura' using errcode = 'TW065';
    end if;
  end if;
  return new;
end $$;

-- Añadir una visita pone el sitio en «Hemos ido». security invoker: quien añade la visita ve el sitio (lo exigen la
-- RLS y b_rules) y places_update le deja cambiarlo. Pasa por los triggers de places (sube version).
create or replace function private.place_visits_after_insert() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.places set status = 'been' where id = new.place_id and status <> 'been';
  return null;
end $$;

drop trigger if exists a_guard on public.place_visits;
create trigger a_guard before insert or update on public.place_visits
  for each row execute function private.force_created_by();
drop trigger if exists b_rules on public.place_visits;
create trigger b_rules before insert or update on public.place_visits
  for each row execute function private.place_visits_before_write();
drop trigger if exists z_touch on public.place_visits;
create trigger z_touch before insert or update on public.place_visits
  for each row execute function private.touch();
drop trigger if exists y_status on public.place_visits;
create trigger y_status after insert on public.place_visits
  for each row execute function private.place_visits_after_insert();

-- -----------------------------------------------------------------------------
-- 3. RLS de visitas: hija de places (la subconsulta pasa por la RLS del sitio). Borrado directo.
-- -----------------------------------------------------------------------------
drop policy if exists place_visits_select on public.place_visits;
create policy place_visits_select on public.place_visits for select to authenticated
  using (couple_id = (select private.my_couple_id())
         and exists (select 1 from public.places p where p.id = place_visits.place_id));
drop policy if exists place_visits_insert on public.place_visits;
create policy place_visits_insert on public.place_visits for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and created_by = (select auth.uid())
              and exists (select 1 from public.places p where p.id = place_visits.place_id));
drop policy if exists place_visits_update on public.place_visits;
create policy place_visits_update on public.place_visits for update to authenticated
  using (couple_id = (select private.my_couple_id())
         and exists (select 1 from public.places p where p.id = place_visits.place_id))
  with check (couple_id = (select private.my_couple_id())
              and exists (select 1 from public.places p where p.id = place_visits.place_id));
drop policy if exists place_visits_delete on public.place_visits;
create policy place_visits_delete on public.place_visits for delete to authenticated
  using (couple_id = (select private.my_couple_id())
         and exists (select 1 from public.places p where p.id = place_visits.place_id));

-- -----------------------------------------------------------------------------
-- 4. place_stats: visitas desde place_visits; dos columnas nuevas al final (create or replace lo permite sin drop
--    y conserva los permisos). Las tres primeras métricas, idénticas salvo visit_count.
-- -----------------------------------------------------------------------------
create or replace view public.place_stats with (security_invoker = true) as
select
  p.id as place_id, p.couple_id,
  (select count(*) from public.place_visits v where v.place_id = p.id)::integer as visit_count,
  (select coalesce(sum(e.amount_cents), 0) from public.expenses e where e.place_id = p.id)::bigint as total_spent_cents,
  (select min(ev.start_date) from public.events ev
    where ev.place_id = p.id and ev.starts_at >= now())                    as next_event_on,
  (select max(v.visited_on) from public.place_visits v where v.place_id = p.id) as last_visit_on,
  -- Fecha más reciente con un evento único ya terminado o un gasto en el sitio, posterior a la última visita.
  (select max(x.d) from (
     select ev.start_date as d from public.events ev
      where ev.place_id = p.id and ev.recurrence = 'none' and ev.ends_at < now()
     union all
     select e.spent_on from public.expenses e where e.place_id = p.id and e.spent_on <= current_date) x
    where x.d > coalesce((select max(v.visited_on) from public.place_visits v where v.place_id = p.id),
                         '-infinity'::date))                                as suggested_visit_on
from public.places p;

-- -----------------------------------------------------------------------------
-- 5. Reserva en eventos (columnas libres: sin cambios en events_before_write)
-- -----------------------------------------------------------------------------
alter table public.events add column if not exists reserved boolean not null default false;
alter table public.events add column if not exists reservation_note text;
alter table public.events drop constraint if exists events_reservation_note_check;
alter table public.events add constraint events_reservation_note_check check (char_length(reservation_note) <= 200);

-- -----------------------------------------------------------------------------
-- 6. Tiempo real
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'place_visits') then
    alter publication supabase_realtime add table public.place_visits;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Permisos explícitos (los privilegios por defecto de Supabase darían todo a anon)
-- -----------------------------------------------------------------------------
revoke all on table public.place_visits from public, anon;
grant select, insert, update, delete on table public.place_visits to authenticated;
grant all on table public.place_visits to service_role;
revoke all on function private.place_visits_before_write() from public, anon, authenticated;
revoke all on function private.place_visits_after_insert() from public, anon, authenticated;

-- PostgREST: que vea la tabla y las columnas nuevas.
notify pgrst, 'reload schema';

commit;

-- =============================================================================
-- PARTE B · Pruebas (no dejan nada: todo acaba en ROLLBACK). Ejecutar como postgres.
-- Si una prueba falla, el script se detiene con «FALLO: ...» y la parte A ya está aplicada.
-- Escrituras «de la app» con set local role authenticated y auth.uid() simulado con request.jwt.claims
-- (se aplican la RLS y los triggers); las comprobaciones, como postgres.
-- No cambia la estructura de ninguna tabla ni toca filas reales: solo una pareja y dos usuarios de prueba.
--   Ana (…0000000000eb, m1) y Beto (…0000000000ec, m2).
-- =============================================================================
begin;
set local idle_in_transaction_session_timeout = '60s';

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000eb', 'visitas-a@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000ec', 'visitas-b@prueba.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-0000000000eb', 'Ana'),
  ('00000000-0000-4000-8000-0000000000ec', 'Beto')
on conflict (id) do update set display_name = excluded.display_name;
insert into public.couples (id) values ('00000000-0000-4000-8000-0000000000fb');
insert into public.couple_settings (couple_id) values ('00000000-0000-4000-8000-0000000000fb') on conflict do nothing;
insert into public.couple_members (couple_id, user_id, slot) values
  ('00000000-0000-4000-8000-0000000000fb', '00000000-0000-4000-8000-0000000000eb', 'm1'),
  ('00000000-0000-4000-8000-0000000000fb', '00000000-0000-4000-8000-0000000000ec', 'm2');

-- Sitios de prueba: pS compartido de Ana (Quiero ir); pP privado de Ana.
do $$
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000eb","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.places (id, couple_id, name, lat, lng, provider, visible_to_partner) values
    ('00000000-0000-4000-8000-00000000ab01', '00000000-0000-4000-8000-0000000000fb', 'Taberna El Olivo', 40.41, -3.70, 'manual', true),
    ('00000000-0000-4000-8000-00000000ab02', '00000000-0000-4000-8000-0000000000fb', 'Joyería', 40.42, -3.71, 'manual', false);
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B1. Estructura y permisos
do $$
begin
  assert (select relrowsecurity from pg_class where oid = 'public.place_visits'::regclass), 'FALLO: place_visits sin RLS';
  assert (select count(*) = 4 from pg_policy where polrelid = 'public.place_visits'::regclass),
         'FALLO: place_visits no tiene sus 4 políticas';
  -- Una a una: con varias separadas por comas, has_table_privilege da true si tiene alguna.
  assert has_table_privilege('authenticated', 'public.place_visits', 'select')
     and has_table_privilege('authenticated', 'public.place_visits', 'insert')
     and has_table_privilege('authenticated', 'public.place_visits', 'update')
     and has_table_privilege('authenticated', 'public.place_visits', 'delete'),
         'FALLO: authenticated no puede usar place_visits';
  assert not has_table_privilege('anon', 'public.place_visits', 'select'), 'FALLO: anon lee place_visits';
  assert not has_table_privilege('anon', 'public.place_visits', 'insert'), 'FALLO: anon escribe en place_visits';
  assert not has_function_privilege('authenticated', 'private.place_visits_before_write()', 'execute'),
         'FALLO: authenticated ejecuta private.place_visits_before_write()';
  assert not has_function_privilege('authenticated', 'private.place_visits_after_insert()', 'execute'),
         'FALLO: authenticated ejecuta private.place_visits_after_insert()';
  assert not (select prosecdef from pg_proc where oid = 'private.place_visits_before_write()'::regprocedure),
         'FALLO: place_visits_before_write debe ser security invoker (la RLS de places decide TW064)';
  assert exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'place_visits'),
         'FALLO: place_visits no está en supabase_realtime';
  assert (select reloptions @> array['security_invoker=true'] from pg_class where oid = 'public.place_stats'::regclass),
         'FALLO: place_stats ya no es security_invoker';
  assert (select array_agg(attname::text order by attnum) from pg_attribute
          where attrelid = 'public.place_stats'::regclass and attnum > 0 and not attisdropped)
         = array['place_id', 'couple_id', 'visit_count', 'total_spent_cents', 'next_event_on', 'last_visit_on', 'suggested_visit_on'],
         'FALLO: columnas de place_stats';
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events'
                 and column_name = 'reserved' and is_nullable = 'NO' and column_default = 'false'),
         'FALLO: falta events.reserved not null default false';
  assert exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'events'
                 and column_name = 'reservation_note'), 'FALLO: falta events.reservation_note';
  assert (select pg_get_function_result('public.calendar_range(date, date)'::regprocedure) not like '%reserv%'),
         'FALLO: calendar_range cambió de salida';
  assert (select prosrc like '%[Mapa F1]%' from pg_proc where oid = 'private.events_before_write()'::regprocedure),
         'FALLO: events_before_write no es la de 20261126000000_mapa.sql';
end $$;

-- B2. Añadir, corregir y quitar visitas; el sitio pasa a «Hemos ido»; una por día; fechas y nota
do $$
declare
  v_c   constant uuid := '00000000-0000-4000-8000-0000000000fb';
  v_ana constant uuid := '00000000-0000-4000-8000-0000000000eb';
  v_ps  constant uuid := '00000000-0000-4000-8000-00000000ab01';
  v_pp  constant uuid := '00000000-0000-4000-8000-00000000ab02';
  v_v1  constant uuid := '00000000-0000-4000-8000-00000000ac01';
  v_v2  constant uuid := '00000000-0000-4000-8000-00000000ac02';
  v_n   integer;
  v_ok  boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000eb","role":"authenticated"}', true);
  set local role authenticated;
  -- Ana apunta una visita (intenta suplantar a Beto en created_by y deja la nota en blanco)
  insert into public.place_visits (id, couple_id, place_id, visited_on, note, created_by)
  values (v_v1, v_c, v_ps, current_date - 30, '   ', '00000000-0000-4000-8000-0000000000ec');
  -- Reintento con el mismo id: no duplica
  insert into public.place_visits (id, couple_id, place_id, visited_on)
  values (v_v1, v_c, v_ps, current_date - 30) on conflict (id) do nothing;

  -- Otra visita el mismo día con otro id → 23505
  v_ok := false;
  begin
    insert into public.place_visits (couple_id, place_id, visited_on) values (v_c, v_ps, current_date - 30);
  exception when unique_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: dos visitas el mismo día no chocan';

  -- Fecha futura (más de un día) → TW065; mañana sí se admite (margen de zona horaria)
  v_ok := false;
  begin
    insert into public.place_visits (couple_id, place_id, visited_on) values (v_c, v_ps, current_date + 3);
  exception when sqlstate 'TW065' then v_ok := true;
  end;
  assert v_ok, 'FALLO: una visita futura no da TW065';

  -- Fecha absurda o nota larga → 23514
  v_ok := false;
  begin
    insert into public.place_visits (couple_id, place_id, visited_on) values (v_c, v_ps, date '1949-12-31');
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: una visita de 1949 se guarda';
  v_ok := false;
  begin
    insert into public.place_visits (couple_id, place_id, visited_on, note) values (v_c, v_ps, current_date - 40, repeat('x', 201));
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: una nota de 201 caracteres se guarda';

  -- Corregir la fecha a una futura → TW065
  v_ok := false;
  begin
    update public.place_visits set visited_on = current_date + 5 where id = v_v1;
  exception when sqlstate 'TW065' then v_ok := true;
  end;
  assert v_ok, 'FALLO: corregir a una fecha futura no da TW065';

  -- Cambiar de sitio se ignora (place_id fijo)
  update public.place_visits set place_id = v_pp, note = 'Cena de aniversario' where id = v_v1;
  reset role;

  assert (select place_id = v_ps and created_by = v_ana and note = 'Cena de aniversario' and version = 2
          from public.place_visits where id = v_v1),
         'FALLO: la visita cambió de sitio, de autor o no subió de versión';
  assert (select status = 'been' from public.places where id = v_ps), 'FALLO: el sitio no pasó a Hemos ido';
  select count(*) into v_n from public.place_visits where place_id = v_ps;
  assert v_n = 1, 'FALLO: hay ' || v_n || ' visitas (debe haber 1)';

  -- Beto (pareja) ve la visita, añade otra, corrige la de Ana y la quita: directo, sin aprobación
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ec","role":"authenticated"}', true);
  set local role authenticated;
  select count(*) into v_n from public.place_visits where place_id = v_ps;
  assert v_n = 1, 'FALLO: Beto no ve la visita de Ana';
  insert into public.place_visits (id, couple_id, place_id, visited_on) values (v_v2, v_c, v_ps, current_date + 1);
  update public.place_visits set visited_on = current_date - 31 where id = v_v1;
  delete from public.place_visits where id = v_v1;
  -- Quiero ir otra vez: las visitas se quedan
  update public.places set status = 'want_to_go' where id = v_ps;
  reset role;

  assert not exists (select 1 from public.place_visits where id = v_v1), 'FALLO: Beto no pudo quitar la visita de Ana';
  assert (select created_by = '00000000-0000-4000-8000-0000000000ec'::uuid from public.place_visits where id = v_v2),
         'FALLO: la visita de Beto no es suya';
  assert (select status = 'want_to_go' from public.places where id = v_ps), 'FALLO: no se pudo volver a Quiero ir';
  assert exists (select 1 from public.place_visits where id = v_v2), 'FALLO: volver a Quiero ir borró visitas';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B3. Sitio privado: sus visitas son solo de su dueña; la pareja no las ve, no las crea, no las toca
do $$
declare
  v_c   constant uuid := '00000000-0000-4000-8000-0000000000fb';
  v_pp  constant uuid := '00000000-0000-4000-8000-00000000ab02';
  v_vp  constant uuid := '00000000-0000-4000-8000-00000000ac11';
  v_n   integer;
  v_ok  boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000eb","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.place_visits (id, couple_id, place_id, visited_on) values (v_vp, v_c, v_pp, current_date - 2);

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ec","role":"authenticated"}', true);
  select count(*) into v_n from public.place_visits where place_id = v_pp;
  assert v_n = 0, 'FALLO: Beto ve las visitas del sitio privado de Ana';
  select count(*) into v_n from public.place_stats where place_id = v_pp;
  assert v_n = 0, 'FALLO: Beto ve place_stats del sitio privado de Ana';
  v_ok := false;
  begin
    insert into public.place_visits (couple_id, place_id, visited_on) values (v_c, v_pp, current_date - 3);
  exception when sqlstate 'TW064' then v_ok := true;
  end;
  assert v_ok, 'FALLO: Beto apunta una visita al sitio privado de Ana';
  -- Un sitio que no existe también da TW064
  v_ok := false;
  begin
    insert into public.place_visits (couple_id, place_id, visited_on) values (v_c, gen_random_uuid(), current_date - 3);
  exception when sqlstate 'TW064' then v_ok := true;
  end;
  assert v_ok, 'FALLO: una visita a un sitio inexistente no da TW064';
  update public.place_visits set note = 'hackeo' where id = v_vp;
  delete from public.place_visits where id = v_vp;
  reset role;

  assert (select note is null from public.place_visits where id = v_vp), 'FALLO: Beto cambió una visita que no ve';
  assert exists (select 1 from public.place_visits where id = v_vp), 'FALLO: Beto borró una visita que no ve';

  -- Ana revela el sitio: Beto ve su visita
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000eb","role":"authenticated"}', true);
  set local role authenticated;
  update public.places set visible_to_partner = true where id = v_pp;
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ec","role":"authenticated"}', true);
  select count(*) into v_n from public.place_visits where place_id = v_pp;
  assert v_n = 1, 'FALLO: al revelar el sitio, Beto no ve su visita';
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B4. place_stats: recuento y última visita desde place_visits; sugerencia desde eventos pasados y gastos
do $$
declare
  v_c   constant uuid := '00000000-0000-4000-8000-0000000000fb';
  v_px  constant uuid := '00000000-0000-4000-8000-00000000ab21';
  v_s   public.place_stats;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000eb","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.places (id, couple_id, name, lat, lng, provider, visible_to_partner)
  values (v_px, v_c, 'Bar Pepe', 40.47, -3.76, 'manual', true);

  -- Sin nada: 0 visitas, sin fechas
  select * into v_s from public.place_stats where place_id = v_px;
  assert v_s.visit_count = 0 and v_s.last_visit_on is null and v_s.suggested_visit_on is null,
         'FALLO: place_stats de un sitio vacío';

  insert into public.place_visits (couple_id, place_id, visited_on) values (v_c, v_px, current_date - 30);
  -- Evento pasado (-20), recurrente pasado (-3, no cuenta), futuro (+10, próximo plan) y gasto de Beto (-5)
  insert into public.events (couple_id, title, start_date, all_day, place_id) values
    (v_c, 'Cañas', current_date - 20, true, v_px),
    (v_c, 'Próxima cena', current_date + 10, true, v_px);
  insert into public.events (couple_id, title, start_date, all_day, recurrence, place_id) values
    (v_c, 'Cañas de los jueves', current_date - 3, true, 'weekly', v_px);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ec","role":"authenticated"}', true);
  insert into public.expenses (couple_id, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner, place_id)
  values (v_c, 'Raciones', 2400, 'eating_out', current_date - 5, 'm2', 'half', true, v_px);

  select * into v_s from public.place_stats where place_id = v_px;
  assert v_s.visit_count = 1, 'FALLO: visit_count debe contar solo las visitas (' || v_s.visit_count || ')';
  assert v_s.last_visit_on = current_date - 30, 'FALLO: last_visit_on';
  assert v_s.suggested_visit_on = current_date - 5, 'FALLO: suggested_visit_on debe ser el gasto (' || coalesce(v_s.suggested_visit_on::text, 'null') || ')';
  assert v_s.next_event_on = current_date + 10, 'FALLO: next_event_on';
  assert v_s.total_spent_cents = 2400, 'FALLO: total_spent_cents';

  -- Beto apunta la visita sugerida: queda el evento de -20, anterior a la última visita → sin sugerencia
  insert into public.place_visits (couple_id, place_id, visited_on) values (v_c, v_px, current_date - 5);
  select * into v_s from public.place_stats where place_id = v_px;
  assert v_s.visit_count = 2 and v_s.last_visit_on = current_date - 5 and v_s.suggested_visit_on is null,
         'FALLO: place_stats tras apuntar la visita sugerida';
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B5. Borrar el sitio se lleva sus visitas
do $$
declare
  v_c   constant uuid := '00000000-0000-4000-8000-0000000000fb';
  v_pz  constant uuid := '00000000-0000-4000-8000-00000000ab31';
  v_r   jsonb;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000eb","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.places (id, couple_id, name, lat, lng, provider, visible_to_partner)
  values (v_pz, v_c, 'Floristería secreta', 40.46, -3.75, 'manual', false);
  insert into public.place_visits (couple_id, place_id, visited_on) values (v_c, v_pz, current_date - 1);
  v_r := public.request_deletion(gen_random_uuid(), 'place', v_pz);
  assert v_r ->> 'status' = 'deleted', 'FALLO: borrar un sitio privado con visitas (' || v_r::text || ')';
  reset role;
  assert not exists (select 1 from public.place_visits where place_id = v_pz), 'FALLO: las visitas sobreviven al sitio';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B6. Reserva en eventos: por defecto no; los dos la marcan; nota ≤ 200; calendar_range sigue funcionando
do $$
declare
  v_c   constant uuid := '00000000-0000-4000-8000-0000000000fb';
  v_ev  constant uuid := '00000000-0000-4000-8000-00000000ad01';
  v_ev2 constant uuid := '00000000-0000-4000-8000-00000000ad02';
  v_n   integer;
  v_ok  boolean;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000eb","role":"authenticated"}', true);
  set local role authenticated;
  insert into public.events (id, couple_id, title, start_date, start_time) values (v_ev, v_c, 'Cena', '2030-05-10', '21:30');
  insert into public.events (id, couple_id, title, start_date, start_time, reserved, reservation_note)
  values (v_ev2, v_c, 'Cena reservada', '2030-05-11', '21:30', true, 'A nombre de Ana, 21:30');

  v_ok := false;
  begin
    update public.events set reservation_note = repeat('x', 201) where id = v_ev;
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: una nota de reserva de 201 caracteres se guarda';

  select count(*) into v_n from public.calendar_range('2030-05-01', '2030-05-31') r where r.source_id in (v_ev, v_ev2);
  assert v_n = 2, 'FALLO: calendar_range no devuelve los eventos (' || v_n || ')';

  -- Beto marca la reserva del evento de Ana
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000ec","role":"authenticated"}', true);
  update public.events set reserved = true, reservation_note = 'A nombre de Beto' where id = v_ev;
  reset role;

  assert (select reserved and reservation_note = 'A nombre de Beto' and version = 2 from public.events where id = v_ev),
         'FALLO: la pareja no pudo marcar la reserva';
  assert (select reserved and reservation_note = 'A nombre de Ana, 21:30' from public.events where id = v_ev2),
         'FALLO: el evento no se creó reservado';
  perform set_config('request.jwt.claims', '{}', true);
end $$;

-- B7. Final
do $$
begin
  raise notice 'PRUEBAS DE VISITAS Y RESERVA: todas correctas';
end $$;

rollback;
