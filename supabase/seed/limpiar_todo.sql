-- =============================================================================
-- ito · Limpieza total del contenido de la pareja (antes de las pruebas conjuntas)
-- 2026-11-21 · Ver supabase/seed/LEEME.md («Limpieza total antes de las pruebas conjuntas»).
--
-- NO es una migración: no la muevas a supabase/migrations/.
-- Se ejecuta a mano:  supabase db query --remote -f supabase/seed/limpiar_todo.sql
-- (o pegándolo entero en el SQL Editor). Corre como postgres: los triggers de «escritura del cliente»
-- (is_client_write) no bloquean, y no hay auth.uid().
--
-- BORRA (sin papelera), solo en el espacio elegido:
--   tareas de planes, ideas, TODOS los gastos, liquidaciones, TODOS los movimientos del bote (aportaciones,
--   reembolsos y ajustes), cobros y pagos recurrentes, excepciones de eventos, eventos (y cumpleaños),
--   visitas y notas de sitios, pertenencias a colecciones, sitios, colecciones, planes,
--   avisos push en cola (push_outbox) y sus tickets (push_tickets), y las solicitudes de borrado.
-- CONSERVA: usuarios (auth.users), perfiles, la pareja (couples), los miembros con sus colores y ajustes
--   (couple_members), couple_settings (incluida la configuración del bote), las propuestas de ajustes,
--   las invitaciones y los tokens de push (push_tokens).
--
-- BOTE: se vacía entero (saldo 0 €) y se conserva su configuración (activado, aportación, %, categorías…).
--   Las aportaciones de prueba sin gastos dejarían dinero inventado en el bote; los reembolsos, un saldo negativo.
--   pot_generated_through no se toca: el job diario no vuelve a crear las aportaciones automáticas ya pasadas.
--
-- MODO (abajo, en c_modo):
--   'ensayo'  (por defecto): lo hace todo y al final lanza un ERROR a propósito con el resumen. El error lo
--             deshace todo: no se guarda nada. El resumen está en el mensaje de error.
--   'aplicar': hace lo mismo, lo guarda y al final sale una tabla con el resumen.
-- Todo va en un único bloque DO: es atómico. Si algo falla (o una comprobación final no cuadra), no se guarda nada.
-- =============================================================================

do $limpia$
declare
  -- ============================== CONFIGURACIÓN ==============================
  c_modo   constant text := 'ensayo';  -- 'ensayo' (no guarda nada) o 'aplicar' (guarda)
  v_couple uuid := null;               -- null = el único espacio que haya. Si hay varios, pon aquí el id del vuestro:
                                       -- v_couple uuid := '00000000-0000-0000-0000-000000000000';
  -- ===========================================================================

  -- Tablas que se vacían, en el orden de borrado (hijas antes que padres: así ninguna FK «set null» ni
  -- cascada dispara triggers de UPDATE sobre filas que aún existen).
  c_vaciar constant text[] := array[
    'plan_tasks', 'ideas', 'expenses', 'settlements', 'pot_movements',
    'recurring_occurrences', 'recurring_payments', 'event_exceptions', 'events',
    'place_visits', 'place_notes', 'places', 'collection_places', 'collections', 'plans',
    'push_tickets', 'push_outbox', 'deletion_requests'];
  -- Lo que se conserva: se compara una huella (md5 de las filas) antes y después.
  c_conservar constant text[] := array[
    'auth.users', 'profiles', 'couples', 'couple_members', 'couple_settings',
    'settings_proposals', 'couple_invitations', 'push_tokens'];

  v_n        integer;
  v_t        text;
  v_antes    jsonb := '{}';
  v_despues  jsonb := '{}';
  v_hu_antes jsonb := '{}';
  v_hu_desp  jsonb := '{}';
  v_mal      text[] := '{}';

  -- Información extra para el resumen
  v_cumples   integer;
  v_recibos   integer;
  v_pot_on    boolean;
  v_pot_saldo bigint;
  v_pot_tipos text;
  v_inf       text;
begin
  -- ---------------------------------------------------------------------------
  -- 0. Comprobaciones: modo, migraciones y espacio
  -- ---------------------------------------------------------------------------
  if c_modo not in ('ensayo', 'aplicar') then
    raise exception 'c_modo tiene que ser ''ensayo'' o ''aplicar'' (ahora es ''%'')', c_modo;
  end if;

  foreach v_t in array c_vaciar || array['couple_members', 'couple_settings', 'settings_proposals',
                                          'couple_invitations', 'push_tokens'] loop
    if to_regclass('public.' || v_t) is null then
      raise exception 'Falta la tabla public.% (¿migraciones sin aplicar?). No se ha tocado nada.', v_t;
    end if;
  end loop;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'events' and column_name = 'category') then
    raise exception 'Falta aplicar la migración 20261121000000_calendario_v2.sql (events.category no existe).';
  end if;

  if v_couple is null then
    select count(*) into v_n from public.couples;
    if v_n = 0 then
      raise exception 'No hay ningún espacio (tabla couples vacía): no hay nada que limpiar.';
    elsif v_n > 1 then
      raise exception 'Hay % espacios en la base de datos. Para no tocar datos ajenos, pon el id del vuestro en v_couple (arriba) y vuelve a ejecutar.', v_n;
    end if;
    select c.id into v_couple from public.couples c;
  elsif not exists (select 1 from public.couples c where c.id = v_couple) then
    raise exception 'No existe ningún espacio con id %', v_couple;
  end if;

  -- ---------------------------------------------------------------------------
  -- 1. Foto de antes: filas por tabla y huellas de lo que se conserva
  -- ---------------------------------------------------------------------------
  foreach v_t in array c_vaciar loop
    if v_t = 'push_tickets' then
      select count(*) into v_n from public.push_tickets k
      where k.outbox_id in (select o.id from public.push_outbox o where o.couple_id = v_couple);
    else
      execute format('select count(*) from public.%I where couple_id = $1', v_t) into v_n using v_couple;
    end if;
    v_antes := v_antes || jsonb_build_object(v_t, v_n);
  end loop;

  select count(*) filter (where category = 'birthday') into v_cumples from public.events where couple_id = v_couple;
  select count(*) into v_recibos from public.expenses where couple_id = v_couple and receipt_path is not null;
  select coalesce(s.pot_enabled, false) into v_pot_on from public.couple_settings s where s.couple_id = v_couple;
  select coalesce((select sum(case m.kind when 'reimbursement' then -m.amount_cents else m.amount_cents end)
                   from public.pot_movements m where m.couple_id = v_couple), 0)
       - coalesce((select sum(e.amount_cents) from public.expenses e
                   where e.couple_id = v_couple and e.paid_by = 'pot'), 0)
    into v_pot_saldo;
  select coalesce(string_agg(format('%s %s', x.n, x.kind), ', ' order by x.kind), 'ninguno')
    into v_pot_tipos
  from (select m.kind::text as kind, count(*) as n from public.pot_movements m
        where m.couple_id = v_couple group by m.kind) x;

  -- Huellas (lo de la pareja; auth.users y profiles, los de todo el proyecto).
  -- auth.users solo por id: el inicio de sesión cambia otras columnas sin que este script toque nada.
  select jsonb_build_object(
    'auth.users',         jsonb_build_array((select count(*) from auth.users),
                            (select md5(coalesce(string_agg(u.id::text, ',' order by u.id), '')) from auth.users u)),
    'profiles',           jsonb_build_array((select count(*) from public.profiles),
                            (select md5(coalesce(string_agg(t::text, ',' order by t.id), '')) from public.profiles t)),
    'couples',            jsonb_build_array(1,
                            (select md5(t::text) from public.couples t where t.id = v_couple)),
    'couple_members',     jsonb_build_array((select count(*) from public.couple_members where couple_id = v_couple),
                            (select md5(coalesce(string_agg(t::text, ',' order by t.user_id), ''))
                             from public.couple_members t where t.couple_id = v_couple)),
    'couple_settings',    jsonb_build_array((select count(*) from public.couple_settings where couple_id = v_couple),
                            (select md5(coalesce(string_agg(t::text, ','), ''))
                             from public.couple_settings t where t.couple_id = v_couple)),
    'settings_proposals', jsonb_build_array((select count(*) from public.settings_proposals where couple_id = v_couple),
                            (select md5(coalesce(string_agg(t::text, ',' order by t.id), ''))
                             from public.settings_proposals t where t.couple_id = v_couple)),
    'couple_invitations', jsonb_build_array((select count(*) from public.couple_invitations where couple_id = v_couple),
                            (select md5(coalesce(string_agg(t::text, ',' order by t.id), ''))
                             from public.couple_invitations t where t.couple_id = v_couple)),
    'push_tokens',        jsonb_build_array((select count(*) from public.push_tokens),
                            (select md5(coalesce(string_agg(t::text, ',' order by t.token), '')) from public.push_tokens t)))
    into v_hu_antes;

  -- ---------------------------------------------------------------------------
  -- 2. Borrado, en orden de dependencias (solo de este espacio)
  -- ---------------------------------------------------------------------------
  -- 2a. Tareas e ideas: enlazan gastos, eventos y sitios (FK «set null»). Fuera primero.
  delete from public.plan_tasks where couple_id = v_couple;
  delete from public.ideas      where couple_id = v_couple;

  -- 2b. Todos los gastos. Como postgres, el trigger de «gasto saldado» (TW010) no bloquea. Su trigger devuelve los
  --     cobros a «pendiente» (se borran en 2d) y cancela sus solicitudes de borrado (se borran en 2g).
  delete from public.expenses where couple_id = v_couple;

  -- 2c. Liquidaciones y bote entero: sin gastos, las aportaciones serían dinero de prueba y los reembolsos un saldo
  --     negativo. La configuración del bote (couple_settings) se queda.
  delete from public.settlements   where couple_id = v_couple;
  delete from public.pot_movements where couple_id = v_couple;

  -- 2d. Cobros y pagos recurrentes.
  delete from public.recurring_occurrences where couple_id = v_couple;
  delete from public.recurring_payments    where couple_id = v_couple;

  -- 2e. Excepciones y eventos (cumpleaños e itinerario de planes incluidos). y_snapshot ya no encuentra gastos.
  delete from public.event_exceptions where couple_id = v_couple;
  delete from public.events           where couple_id = v_couple;

  -- 2f. Mapa y planes. Al borrar los sitios, la cascada se lleva sus pertenencias a colecciones (y_primary ya no
  --     encuentra el sitio: no hay UPDATE). Las colecciones antes que los planes: así la FK plan_id «set null» de
  --     collections no dispara su a_guard.
  delete from public.place_visits      where couple_id = v_couple;
  delete from public.place_notes       where couple_id = v_couple;
  delete from public.places            where couple_id = v_couple;
  delete from public.collection_places where couple_id = v_couple;   -- ya debería estar vacía (cascada)
  delete from public.collections       where couple_id = v_couple;
  delete from public.plans             where couple_id = v_couple;

  -- 2g. Avisos en cola y sus tickets (los tokens se quedan) y, al final, las solicitudes de borrado: así se van
  --     también las que los triggers y_cancel_requests acaban de marcar como canceladas.
  delete from public.push_tickets k
   where k.outbox_id in (select o.id from public.push_outbox o where o.couple_id = v_couple);
  delete from public.push_outbox       where couple_id = v_couple;
  delete from public.deletion_requests where couple_id = v_couple;

  -- ---------------------------------------------------------------------------
  -- 3. Comprobación: lo vaciado a 0 y lo conservado sin cambios
  -- ---------------------------------------------------------------------------
  foreach v_t in array c_vaciar loop
    if v_t = 'push_tickets' then
      select count(*) into v_n from public.push_tickets k
      where k.outbox_id in (select o.id from public.push_outbox o where o.couple_id = v_couple);
    else
      execute format('select count(*) from public.%I where couple_id = $1', v_t) into v_n using v_couple;
    end if;
    v_despues := v_despues || jsonb_build_object(v_t, v_n);
    if v_n <> 0 then v_mal := v_mal || format('%s sigue con %s filas', v_t, v_n); end if;
  end loop;

  select jsonb_build_object(
    'auth.users',         jsonb_build_array((select count(*) from auth.users),
                            (select md5(coalesce(string_agg(u.id::text, ',' order by u.id), '')) from auth.users u)),
    'profiles',           jsonb_build_array((select count(*) from public.profiles),
                            (select md5(coalesce(string_agg(t::text, ',' order by t.id), '')) from public.profiles t)),
    'couples',            jsonb_build_array(1,
                            (select md5(t::text) from public.couples t where t.id = v_couple)),
    'couple_members',     jsonb_build_array((select count(*) from public.couple_members where couple_id = v_couple),
                            (select md5(coalesce(string_agg(t::text, ',' order by t.user_id), ''))
                             from public.couple_members t where t.couple_id = v_couple)),
    'couple_settings',    jsonb_build_array((select count(*) from public.couple_settings where couple_id = v_couple),
                            (select md5(coalesce(string_agg(t::text, ','), ''))
                             from public.couple_settings t where t.couple_id = v_couple)),
    'settings_proposals', jsonb_build_array((select count(*) from public.settings_proposals where couple_id = v_couple),
                            (select md5(coalesce(string_agg(t::text, ',' order by t.id), ''))
                             from public.settings_proposals t where t.couple_id = v_couple)),
    'couple_invitations', jsonb_build_array((select count(*) from public.couple_invitations where couple_id = v_couple),
                            (select md5(coalesce(string_agg(t::text, ',' order by t.id), ''))
                             from public.couple_invitations t where t.couple_id = v_couple)),
    'push_tokens',        jsonb_build_array((select count(*) from public.push_tokens),
                            (select md5(coalesce(string_agg(t::text, ',' order by t.token), '')) from public.push_tokens t)))
    into v_hu_desp;

  foreach v_t in array c_conservar loop
    if v_hu_antes -> v_t is distinct from v_hu_desp -> v_t then
      v_mal := v_mal || format('%s ha cambiado (%s → %s filas)', v_t, v_hu_antes -> v_t ->> 0, v_hu_desp -> v_t ->> 0);
    end if;
  end loop;
  -- Ningún trigger tiene que haber dejado avisos nuevos en la cola (de ninguna pareja).
  select count(*) into v_n from public.push_outbox o where o.created_at >= now();
  if v_n <> 0 then v_mal := v_mal || format('push_outbox tiene %s avisos creados durante la limpieza', v_n); end if;

  if cardinality(v_mal) > 0 then
    raise exception E'LA LIMPIEZA NO CUADRA: no se ha guardado nada.\n  %', array_to_string(v_mal, E'\n  ');
  end if;

  -- ---------------------------------------------------------------------------
  -- 4. Informe
  -- ---------------------------------------------------------------------------
  select string_agg(format('  %-22s %6s → %s', t.n, v_antes ->> t.n, v_despues ->> t.n), E'\n' order by t.i)
    into v_inf
  from unnest(c_vaciar) with ordinality as t(n, i);
  v_inf := format(E'Espacio %s · modo %s\n\nVACIADO (filas antes → después)\n', v_couple, c_modo) || v_inf
    || format(E'\n  (de los eventos, cumpleaños: %s)\n', v_cumples);

  v_inf := v_inf || E'\nCONSERVADO (filas, sin cambios)\n' || (
    select string_agg(format('  %-22s %6s', t.n, v_hu_desp -> t.n ->> 0), E'\n' order by t.i)
    from unnest(c_conservar) with ordinality as t(n, i));

  v_inf := v_inf || format(
       E'\n\nBOTE\n  activado: %s · configuración conservada · movimientos borrados: %s\n'
    || E'  saldo antes %s € → después 0,00 €\n',
    case when v_pot_on then 'sí' else 'no' end, v_pot_tipos,
    replace(to_char(v_pot_saldo / 100.0, 'FM9999990.00'), '.', ','));
  if v_recibos > 0 then
    v_inf := v_inf || format(E'\nAVISO: %s gastos tenían foto del ticket: los archivos quedan en Storage '
                             '(bucket receipts/%s/) sin gasto. Bórralos desde el panel si quieres.\n', v_recibos, v_couple);
  end if;

  if c_modo = 'ensayo' then
    raise exception E'ENSAYO: NO SE HA GUARDADO NADA (este error lo deshace todo a propósito).\nSi el resumen está bien, cambia c_modo a ''aplicar'' y ejecuta otra vez.\n\n%', v_inf;
  end if;

  perform set_config('ito.limpieza_informe', E'APLICADO: los cambios se han guardado.\n\n' || v_inf, false);
end
$limpia$;

-- Solo llega aquí en modo 'aplicar': el resumen, una línea por fila.
select t.linea as resultado
from regexp_split_to_table(coalesce(nullif(current_setting('ito.limpieza_informe', true), ''), 'No se ha aplicado nada'), E'\n')
     with ordinality as t(linea, n)
order by t.n;
