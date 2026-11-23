-- =============================================================================
-- ito · Categorías nuevas de eventos y gastos
--
-- Qué hace:
--   1. Eventos: amplía el CHECK events_category con cinco valores nuevos:
--        sports (Deportivo), home_night (Velada en casa), culture (Cultura: cine, teatro, conciertos,
--        exposiciones), social (Quedada: amigos o familia) y health (Salud: citas médicas).
--      Lista completa: trip, eating_out, leisure, birthday, other, sports, home_night, culture, social, health.
--      No toca events_cumple ni events_birth_year. El nuevo CHECK es más permisivo que el anterior:
--      ninguna fila existente puede incumplirlo (producción, 2026-11-22: other 4, birthday 5, trip 1).
--   2. Gastos: añade 'delivery' (Comida a domicilio) al enum public.expense_category.
--      No cambia couple_settings.pot_categories (ni su valor por defecto ni los datos).
--
-- Revisado y sin cambios: calendar_range (devuelve category tal cual), avisos programados
-- (20261124000000: solo distinguen 'birthday' del resto), request_deletion / itinerario
-- (solo 'birthday' para el texto), expense_totals, recurring_payments.category, generación de
-- recurrentes y compute_shares (usan el enum sin enumerar sus valores).
--
-- Requiere 20261121000000_calendario_v2.sql.
-- Es idempotente. Tres bloques:
--   A1 · añade el valor del enum y hace COMMIT: un valor nuevo de enum no se puede usar en la misma
--        transacción en la que se añade, así que no puede ir junto al resto.
--   A2 · CHECK de eventos, en otra transacción.
--   B  · pruebas que acaban en ROLLBACK.
-- Funciona entero en el SQL Editor o con `supabase db query --remote -f`: los COMMIT explícitos separan
-- las transacciones aunque todo vaya en un único mensaje.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A1. Valor nuevo del enum de gastos (transacción propia)
-- -----------------------------------------------------------------------------
begin;
alter type public.expense_category add value if not exists 'delivery';
commit;

-- -----------------------------------------------------------------------------
-- A2. CHECK de categorías de eventos
-- -----------------------------------------------------------------------------
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'events' and column_name = 'category') then
    raise exception 'Aplica antes 20261121000000_calendario_v2.sql (events.category no existe)';
  end if;
end $$;

alter table public.events drop constraint if exists events_category;
alter table public.events add constraint events_category
  check (category in ('trip', 'eating_out', 'leisure', 'birthday', 'other',
                      'sports', 'home_night', 'culture', 'social', 'health'));

commit;

-- =============================================================================
-- PARTE B · Pruebas (no dejan nada: todo acaba en ROLLBACK). Ejecutar como postgres.
-- Si una prueba falla, el script se detiene con «FALLO: ...» y la parte A ya está aplicada.
-- Escrituras «de la app» con set local role authenticated y auth.uid() simulado con request.jwt.claims
-- (se aplican la RLS y los triggers); las comprobaciones, como postgres.
-- No cambia la estructura de ninguna tabla ni toca filas reales: solo una pareja y dos usuarios de prueba.
--   Ana (…0000000000c7, m1) y Beto (…0000000000c8, m2).
-- =============================================================================
begin;
set local idle_in_transaction_session_timeout = '60s';

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000c7', 'categorias-a@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c8', 'categorias-b@prueba.invalid', 'authenticated', 'authenticated');
insert into public.profiles (id, display_name) values
  ('00000000-0000-4000-8000-0000000000c7', 'Ana'),
  ('00000000-0000-4000-8000-0000000000c8', 'Beto')
on conflict (id) do update set display_name = excluded.display_name;
insert into public.couples (id) values ('00000000-0000-4000-8000-0000000000c9');
insert into public.couple_settings (couple_id) values ('00000000-0000-4000-8000-0000000000c9') on conflict do nothing;
insert into public.couple_members (couple_id, user_id, slot) values
  ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000c7', 'm1'),
  ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-0000000000c8', 'm2');

-- B1. Estructura
do $$
begin
  assert (select pg_get_constraintdef(oid) from pg_constraint
          where conrelid = 'public.events'::regclass and conname = 'events_category')
         like all (array['%sports%', '%home_night%', '%culture%', '%social%', '%health%', '%birthday%', '%trip%']),
         'FALLO: events_category no tiene la lista ampliada';
  assert exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass and conname = 'events_cumple'),
         'FALLO: falta events_cumple';
  assert exists (select 1 from pg_constraint where conrelid = 'public.events'::regclass and conname = 'events_birth_year'),
         'FALLO: falta events_birth_year';
  assert (select array_agg(enumlabel::text order by enumsortorder) from pg_enum
          where enumtypid = 'public.expense_category'::regtype)
         = array['home', 'groceries', 'eating_out', 'leisure', 'transport', 'subscriptions', 'health', 'gifts', 'other', 'delivery'],
         'FALLO: valores de expense_category';
  assert (select column_default from information_schema.columns
          where table_schema = 'public' and table_name = 'couple_settings' and column_name = 'pot_categories')
         like '%{home,groceries,subscriptions}%',
         'FALLO: cambió el valor por defecto de pot_categories';
end $$;

-- B2. La app crea un evento de cada categoría nueva y un gasto «delivery»; lo inválido sigue fallando
do $$
declare
  v_c  constant uuid := '00000000-0000-4000-8000-0000000000c9';
  v_n  integer;
  v_ok boolean;
  v_t  record;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000c7","role":"authenticated"}', true);
  set local role authenticated;

  insert into public.events (couple_id, title, start_date, all_day, category) values
    (v_c, 'Pádel',          '2030-03-01', true, 'sports'),
    (v_c, 'Peli y manta',   '2030-03-02', true, 'home_night'),
    (v_c, 'Teatro',         '2030-03-03', true, 'culture'),
    (v_c, 'Cena con Laura', '2030-03-04', true, 'social'),
    (v_c, 'Dentista',       '2030-03-05', true, 'health');

  v_ok := false;
  begin
    insert into public.events (couple_id, title, start_date, all_day, category)
    values (v_c, 'Inválido', '2030-03-06', true, 'cine');
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: un evento con categoría inválida se guarda';

  v_ok := false;
  begin
    insert into public.events (couple_id, title, start_date, all_day, category, birth_year)
    values (v_c, 'No es cumple', '2030-03-07', true, 'sports', 1990);
  exception when check_violation then v_ok := true;
  end;
  assert v_ok, 'FALLO: birth_year se acepta en un evento que no es cumpleaños';

  insert into public.expenses (couple_id, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner)
  values (v_c, 'Pizza', 2200, 'delivery', current_date, 'm1', 'half', true);

  v_ok := false;
  begin
    insert into public.expenses (couple_id, concept, amount_cents, category, spent_on, paid_by, split_mode, visible_to_partner)
    values (v_c, 'Inválido', 100, 'pizza', current_date, 'm1', 'half', true);
  exception when invalid_text_representation then v_ok := true;
  end;
  assert v_ok, 'FALLO: un gasto con categoría inválida se guarda';

  select * into v_t from public.expense_totals('delivery', null, null);
  assert v_t.expense_count = 1 and v_t.total_cents = 2200,
         'FALLO: expense_totals por delivery (' || v_t.expense_count || ', ' || v_t.total_cents || ')';

  select count(*) into v_n from public.calendar_range('2030-03-01', '2030-03-31') r
  where r.kind = 'event' and r.category in ('sports', 'home_night', 'culture', 'social', 'health');
  assert v_n = 5, 'FALLO: calendar_range no devuelve los cinco eventos nuevos (' || v_n || ')';

  reset role;
  perform set_config('request.jwt.claims', '{}', true);

  assert (select count(*) = 5 from public.events
          where couple_id = v_c and category in ('sports', 'home_night', 'culture', 'social', 'health')),
         'FALLO: no se guardaron los cinco eventos';
  assert (select share_m1_cents = 1100 and share_m2_cents = 1100 from public.expenses
          where couple_id = v_c and category = 'delivery'),
         'FALLO: el reparto 50/50 del gasto delivery';
end $$;

-- B3. Final
do $$
begin
  raise notice 'PRUEBAS DE CATEGORÍAS: todas correctas';
end $$;

rollback;
