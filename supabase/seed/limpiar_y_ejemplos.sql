-- =============================================================================
-- ito · Limpiar Calendario y Gastos y crear ejemplos (solo para probar la app)
-- 2026-11-18 · Ver supabase/seed/LEEME.md.
--
-- NO es una migración: no la muevas a supabase/migrations/. Se ejecuta a mano en el SQL Editor.
--
-- Qué hace, en el espacio (couple) elegido:
--   1. BORRA (sin papelera): eventos, excepciones de eventos, pagos recurrentes y sus cobros, TODOS los gastos,
--      todas las liquidaciones, los reembolsos del bote y las solicitudes de borrado de esas cosas.
--      NO toca: el espacio, los miembros, couple_settings, las aportaciones ni los ajustes del bote,
--      las propuestas de ajustes, planes, sitios ni colecciones.
--   2. CREA ejemplos de calendario (eventos, viajes, cumpleaños, secretos, «¿Quién pagó?», una excepción),
--      pagos recurrentes (con sus cobros pasados y un cobro variable pendiente) y gastos con liquidaciones.
--
-- MODO (arriba, en c_modo):
--   'ensayo'  (por defecto): hace todo y al final lanza un ERROR a propósito con el resumen. El error deshace
--             todo: no se guarda nada. Lee el resumen en el mensaje de error.
--   'aplicar': hace lo mismo y lo guarda. Al final sale una tabla con el resumen.
-- Todo va en un único bloque DO: es atómico. Si algo falla a mitad, no se guarda nada.
-- (No se usa begin/rollback al final porque el SQL Editor solo enseña el resultado de la última sentencia:
--  con un rollback final el resumen no se vería.)
-- =============================================================================

do $seed$
declare
  -- ============================== CONFIGURACIÓN ==============================
  c_modo   constant text := 'ensayo';  -- 'ensayo' (no guarda nada) o 'aplicar' (guarda)
  v_couple uuid := null;               -- null = el único espacio que haya. Si hay varios, pon aquí el id del tuyo:
                                       -- v_couple uuid := '00000000-0000-0000-0000-000000000000';
  -- ===========================================================================
  v_m1 uuid;                 -- user_id del hueco m1
  v_m2 uuid;                 -- user_id del hueco m2
  v_hoy date;                -- «hoy» en la zona horaria de la pareja
  v_wk  date;                -- lunes de esta semana
  v_mes date;                -- día 1 de este mes
  v_anio integer;
  v_currency char(3);
  v_n integer;

  -- Bote
  v_pot        boolean;      -- bote activado
  v_bote_saldo bigint;       -- dinero en el bote tras limpiar (aportaciones + ajustes)
  v_bote_paga  boolean;      -- hay dinero para que el bote pague los ejemplos (≥ 250 €)
  v_luz_paga   public.party;
  v_bote_modo  public.split_mode;

  -- Borrados
  d_req integer; d_exp integer; d_set integer; d_reimb integer;
  d_occ integer; d_rec integer; d_exc integer; d_ev integer;

  -- Creación
  r        record;
  v_d      date;
  v_ultimo date;
  v_occ    uuid;
  v_ev_cine uuid;
  v_g_compra uuid;
  v_g_ferre  uuid;
  v_set    uuid;
  v_net    bigint;
  v_from   public.party;
  v_to     public.party;
  v_rcv    uuid;

  -- Informe
  v_inf   text;
  v_lista text;
  v_saldo bigint;
  v_espera bigint;
  v_bote_gastado bigint;
begin
  -- ---------------------------------------------------------------------------
  -- 0. Comprobaciones: modo, migraciones y espacio
  -- ---------------------------------------------------------------------------
  if c_modo not in ('ensayo', 'aplicar') then
    raise exception 'c_modo tiene que ser ''ensayo'' o ''aplicar'' (ahora es ''%'')', c_modo;
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'events' and column_name = 'category') then
    raise exception 'Falta aplicar la migración 20261121000000_calendario_v2.sql (events.category no existe).';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'recurring_payments' and column_name = 'active_from') then
    raise exception 'Falta aplicar la migración 20261119000000_recurrentes.sql (recurring_payments.active_from no existe).';
  end if;

  if v_couple is null then
    select count(*) into v_n from public.couples;
    if v_n = 0 then
      raise exception 'No hay ningún espacio (tabla couples vacía): no hay nada que limpiar.';
    elsif v_n > 1 then
      raise exception 'Hay % espacios en la base de datos. Para no tocar datos ajenos, pon el id del tuyo en v_couple (arriba) y vuelve a ejecutar.', v_n;
    end if;
    select c.id into v_couple from public.couples c;
  elsif not exists (select 1 from public.couples c where c.id = v_couple) then
    raise exception 'No existe ningún espacio con id %', v_couple;
  end if;

  select m.user_id into v_m1 from public.couple_members m where m.couple_id = v_couple and m.slot = 'm1' and m.left_at is null;
  select m.user_id into v_m2 from public.couple_members m where m.couple_id = v_couple and m.slot = 'm2' and m.left_at is null;
  if v_m1 is null or v_m2 is null then
    raise exception 'El espacio % necesita a las dos personas activas (m1 y m2) para crear los ejemplos.', v_couple;
  end if;
  if not exists (select 1 from public.couple_settings s where s.couple_id = v_couple) then
    raise exception 'El espacio % no tiene fila en couple_settings.', v_couple;
  end if;

  v_hoy  := private.couple_today(v_couple);
  v_wk   := date_trunc('week', v_hoy::timestamp)::date;
  v_mes  := date_trunc('month', v_hoy::timestamp)::date;
  v_anio := extract(year from v_hoy)::integer;
  select c.currency into v_currency from public.couples c where c.id = v_couple;

  -- ---------------------------------------------------------------------------
  -- 1. Limpieza (solo de este espacio), en orden de dependencias
  -- ---------------------------------------------------------------------------
  -- 1a. Solicitudes de borrado (pendientes e historial) de lo que se va a borrar: gastos, eventos, recurrentes
  --     y los reembolsos del bote. Las de sitios, planes, colecciones y aportaciones se quedan.
  delete from public.deletion_requests d
   where d.couple_id = v_couple
     and (d.target_type in ('expense', 'event', 'recurring_payment')
          or (d.target_type = 'pot_movement'
              and d.target_id in (select m.id from public.pot_movements m
                                  where m.couple_id = v_couple and m.kind = 'reimbursement')));
  get diagnostics d_req = row_count;

  -- 1b. Todos los gastos (manuales, de cobros recurrentes y de «¿Quién pagó?»). Sus triggers devuelven los
  --     cobros a «pendiente» (se borran después) y las tareas de plan que los enlazaban quedan sin gasto.
  delete from public.expenses e where e.couple_id = v_couple;
  get diagnostics d_exp = row_count;

  -- 1c. Liquidaciones: ya no cubren ningún gasto.
  delete from public.settlements s where s.couple_id = v_couple;
  get diagnostics d_set = row_count;

  -- 1d. Reembolsos del bote: devolvían lo que el bote debía por gastos que ya no existen. Si se quedaran,
  --     «el bote te debe» saldría negativo. Las aportaciones y los ajustes se quedan.
  delete from public.pot_movements m where m.couple_id = v_couple and m.kind = 'reimbursement';
  get diagnostics d_reimb = row_count;

  -- 1e. Cobros y pagos recurrentes.
  delete from public.recurring_occurrences o where o.couple_id = v_couple;
  get diagnostics d_occ = row_count;
  delete from public.recurring_payments rp where rp.couple_id = v_couple;
  get diagnostics d_rec = row_count;

  -- 1f. Excepciones y eventos (también los del itinerario de un plan, si los hubiera).
  delete from public.event_exceptions x where x.couple_id = v_couple;
  get diagnostics d_exc = row_count;
  delete from public.events ev where ev.couple_id = v_couple;
  get diagnostics d_ev = row_count;

  -- ---------------------------------------------------------------------------
  -- 2. Bote: ¿se puede usar en los ejemplos?
  -- ---------------------------------------------------------------------------
  select coalesce(s.pot_enabled, false) into v_pot from public.couple_settings s where s.couple_id = v_couple;
  select coalesce(sum(case m.kind when 'reimbursement' then -m.amount_cents else m.amount_cents end), 0)
    into v_bote_saldo
  from public.pot_movements m where m.couple_id = v_couple;
  v_bote_paga := v_pot and v_bote_saldo >= 25000;
  -- «Luz»: la paga el bote si tiene dinero; si el bote está activo pero vacío, la adelanta m1 para el bote;
  -- sin bote, la paga m1 a medias.
  v_luz_paga  := case when v_bote_paga then 'pot' else 'm1' end;
  v_bote_modo := case when v_pot then 'pot' else 'half' end;

  -- ---------------------------------------------------------------------------
  -- 3. Eventos del calendario
  --    Fechas relativas al lunes de esta semana (v_wk) para que los días de ejemplo caigan siempre igual.
  --    time_zone, starts_at y ends_at los pone el trigger. created_by se da a mano (auth.uid() es null aquí).
  --    Cumpleaños: año ancla 2000, cada año, todo el día (CHECK events_cumple).
  -- ---------------------------------------------------------------------------
  insert into public.events (couple_id, title, category, start_date, start_time, end_date, end_time, all_day,
                             recurrence, recurrence_until, attendees, budget_cents, ask_who_paid,
                             reminder_minutes, is_secret, birth_year, notes, created_by)
  select v_couple, x.title, x.category, x.sd, x.st::time, x.ed, x.et::time, x.all_day,
         x.rec::public.recurrence, x.until, x.att::public.attendees, x.budget, x.ask,
         x.reminder, x.secret, x.birth::smallint, x.notes,
         case x.who when 'm1' then v_m1 else v_m2 end
  from (values
    -- Repetidos con hora
    ('Pádel',                 'leisure',    v_wk - 27, '19:00', null::date, '20:30', false, 'weekly',  null::date, 'm1',   null::integer, false, 60,   false, null::integer, 'Pista 3', 'm1'),
    ('Yoga',                  'leisure',    v_wk - 25, '08:00', null,       null,    false, 'weekly',  v_wk + 45,  'm2',   null,          false, null, false, null,          null,      'm2'),
    ('Reunión de vecinos',    'other',      v_wk - 34, '19:30', null,       '21:00', false, 'monthly', null,       'both', null,          false, 1440, false, null,          'En el portal', 'm1'),
    ('Aniversario',           'eating_out', ((v_wk + 26) - interval '2 years')::date, '21:30', null, '23:30', false, 'yearly', null, 'both', 12000, false, 1440, false, null, 'Reservar mesa con tiempo', 'm2'),
    -- Varios días (todo el día)
    ('Escapada a Lisboa',     'trip',       v_wk + 22, null,    v_wk + 25,  null,    true,  'none',    null,       'both', 40000,         false, 9540, false, null,          'Vuelo el martes a primera hora', 'm1'),
    ('Congreso en Valencia',  'trip',       v_wk + 11, null,    v_wk + 15,  null,    true,  'none',    null,       'm1',   null,          false, 900,  false, null,          null,      'm1'),
    ('Casa de los abuelos',   'trip',       v_wk + 13, null,    v_wk + 16,  null,    true,  'none',    null,       'm2',   null,          false, null, false, null,          null,      'm2'),
    ('Curso intensivo',       'other',      v_wk + 14, null,    v_wk + 16,  null,    true,  'none',    null,       'both', null,          false, null, false, null,          null,      'm1'),
    ('Finde de surf',         'trip',       v_wk + 53, null,    v_wk + 55,  null,    true,  'weekly',  v_wk + 74,  'both', 15000,         false, 900,  false, null,          null,      'm2'),
    ('Visita a Zaragoza',     'trip',       v_wk - 24, null,    v_wk - 22,  null,    true,  'monthly', null,       'm2',   null,          false, null, false, null,          null,      'm2'),
    ('Nochebuena y Navidad',  'other',      make_date(v_anio, 12, 24), null, make_date(v_anio, 12, 25), null, true, 'none', null, 'both', null, false, 9540, false, null, null, 'm1'),
    -- Un día, con hora o de todo el día
    ('Revisión dental',       'other',      v_wk + 3,  '10:00', null,       '11:00', false, 'none',    null,       'm2',   null,          false, 60,   false, null,          null,      'm2'),
    ('Llamar al seguro',      'other',      v_wk + 3,  '12:00', null,       null,    false, 'none',    null,       'm1',   null,          false, 0,    false, null,          null,      'm1'),
    ('Médico de cabecera',    'other',      v_wk + 4,  '09:30', null,       '10:00', false, 'none',    null,       'm1',   null,          false, 60,   false, null,          null,      'm1'),
    ('Afterwork',             'eating_out', v_wk + 4,  '19:00', null,       null,    false, 'none',    null,       'm2',   null,          false, null, false, null,          null,      'm2'),
    ('Cena en casa de Marta', 'eating_out', v_wk + 4,  '21:00', null,       null,    false, 'none',    null,       'both', 3000,          false, 1440, false, null,          'Llevar vino', 'm1'),
    ('Brunch',                'eating_out', v_wk + 5,  '11:30', null,       null,    false, 'none',    null,       'both', null,          false, null, false, null,          null,      'm2'),
    ('Peluquería',            'other',      v_wk + 9,  '17:00', null,       '18:00', false, 'none',    null,       'm2',   null,          false, 60,   false, null,          null,      'm2'),
    ('Cena de empresa',       'eating_out', v_wk + 17, '21:00', null,       null,    false, 'none',    null,       'm1',   null,          false, null, false, null,          null,      'm1'),
    ('Cena con amigos',       'eating_out', v_wk + 18, '21:30', null,       null,    false, 'none',    null,       'both', 8000,          true,  1440, false, null,          null,      'm2'),
    ('Día libre',             'other',      v_wk + 18, null,    null,       null,    true,  'none',    null,       'm2',   null,          false, 900,  false, null,          null,      'm2'),
    ('Concierto',             'leisure',    v_wk + 29, '21:00', null,       '23:30', false, 'none',    null,       'both', 9000,          true,  1440, false, null,          null,      'm1'),
    -- Secretos (cada uno solo lo ve quien lo crea), el mismo día que el cumpleaños del abuelo
    ('Preparar la sorpresa',  'other',      v_wk + 6,  null,    null,       null,    true,  'none',    null,       'm1',   null,          false, null, true,  null,          'Que no se entere', 'm1'),
    ('Comprar el regalo sorpresa', 'other', v_wk + 6,  '17:00', null,       null,    false, 'none',    null,       'm2',   null,          false, null, true,  null,          null,      'm2'),
    -- «¿Quién pagó?» ya pasado: uno sin resolver (tarjeta) y otro resuelto con su gasto (más abajo)
    ('Cena japonesa',         'eating_out', v_hoy - 1, '21:00', null,       null,    false, 'none',    null,       'both', 6000,          true,  60,   false, null,          null,      'm1'),
    ('Cine',                  'leisure',    v_hoy - 4, '18:00', null,       '20:15', false, 'none',    null,       'both', 2500,          true,  null, false, null,          null,      'm2'),
    -- Cumpleaños (attendees = de parte de quién)
    ('Carmen',                'birthday',   make_date(2000, extract(month from v_wk + 5)::int,  extract(day from v_wk + 5)::int),  null, null, null, true, 'yearly', null, 'm2',   null, false, 900,  false, 1966, 'Le gustan las orquídeas', 'm2'),
    ('Laura',                 'birthday',   make_date(2000, extract(month from v_wk + 5)::int,  extract(day from v_wk + 5)::int),  null, null, null, true, 'yearly', null, 'm1',   null, false, 900,  false, null, null, 'm1'),
    ('Abuelo Paco',           'birthday',   make_date(2000, extract(month from v_wk + 6)::int,  extract(day from v_wk + 6)::int),  null, null, null, true, 'yearly', null, 'both', null, false, 9540, false, 1940, null, 'm1'),
    ('Leo',                   'birthday',   date '2000-02-29',                                                                   null, null, null, true, 'yearly', null, 'm1',   null, false, 900,  false, 1996, 'Nació un 29 de febrero', 'm1'),
    ('Javi',                  'birthday',   make_date(2000, extract(month from v_wk + 65)::int, extract(day from v_wk + 65)::int), null, null, null, true, 'yearly', null, 'm2',   null, false, null, false, null, null, 'm2'),
    ('Lucía',                 'birthday',   make_date(2000, extract(month from v_wk + 31)::int, extract(day from v_wk + 31)::int), null, null, null, true, 'yearly', null, 'both', null, false, 900,  false, null, null, 'm2')
  ) as x(title, category, sd, st, ed, et, all_day, rec, until, att, budget, ask, reminder, secret, birth, notes, who);

  -- «Solo este día»: el Yoga del jueves de la semana que viene no se hace (start v_wk - 25 + 5 semanas).
  insert into public.event_exceptions (event_id, couple_id, occurrence_date)
  select ev.id, ev.couple_id, v_wk + 10 from public.events ev
  where ev.couple_id = v_couple and ev.title = 'Yoga';

  select ev.id into v_ev_cine from public.events ev where ev.couple_id = v_couple and ev.title = 'Cine';

  -- ---------------------------------------------------------------------------
  -- 4. Pagos recurrentes y únicos (todos salen en el calendario)
  --    active_from lo pone el trigger (= hoy). start_date en el pasado para que tengan cobros anteriores.
  --    split_pct_m1 null en «half»/«proportional»: lo rellena el trigger (50 / el % de los ajustes).
  -- ---------------------------------------------------------------------------
  insert into public.recurring_payments (couple_id, name, category, amount_cents, is_variable, frequency,
                                         day_of_month, month_of_year, start_date, end_date, paused, paid_by,
                                         split_mode, split_pct_m1, reminder_days, visible_to_partner,
                                         show_in_calendar, created_by)
  select v_couple, x.name, x.category::public.expense_category, x.amount, x.variable, x.freq::public.payment_frequency,
         x.dom::smallint, x.moy::smallint, x.sd, null, x.paused, x.paid_by::public.party,
         x.split::public.split_mode, x.pct::smallint, x.reminder::smallint, x.visible,
         true, case x.who when 'm1' then v_m1 else v_m2 end
  from (values
    ('Alquiler',                      'home',          95000, false, 'monthly', 1,                                   null::integer,                         v_wk - 80, false, 'm1'::public.party, 'proportional'::public.split_mode, null::integer, 3,    true,  'm1'),
    ('Netflix',                       'subscriptions',  1399, false, 'monthly', extract(day from v_wk + 18)::int,    null,                                  v_wk - 80, false, 'm2',     'half',         null, 0,    true,  'm2'),
    ('Luz',                           'home',           6000, true,  'monthly', extract(day from v_wk + 17)::int,    null,                                  v_wk - 80, false, v_luz_paga, v_bote_modo,  null, 1,    true,  'm1'),
    ('Gas',                           'home',           3500, true,  'monthly', extract(day from v_hoy - 1)::int,    null,                                  v_wk - 80, false, 'm2',     'proportional', null, 1,    true,  'm2'),
    ('Seguro del coche',              'transport',     42000, false, 'yearly',  extract(day from v_wk + 29)::int,    extract(month from v_wk + 29)::int,    ((v_wk + 29) - interval '2 years')::date, false, 'm1', 'only_m1', null, 3, true, 'm1'),
    ('Gimnasio',                      'health',         3990, false, 'monthly', extract(day from v_wk + 29)::int,    null,                                  v_wk - 80, false, 'm2',     'only_m2',      null, 1,    true,  'm2'),
    ('Psicóloga',                     'health',         6000, false, 'monthly', extract(day from v_wk + 24)::int,    null,                                  v_wk - 80, false, 'm1',     'only_m1',      null, null, false, 'm1'),
    ('Spotify Familiar',              'subscriptions',  1799, false, 'monthly', extract(day from v_wk + 29)::int,    null,                                  v_wk - 80, false, 'm1',     'custom',       60,   0,    true,  'm1'),
    ('Revista de cocina',             'subscriptions',   650, false, 'monthly', extract(day from v_wk + 3)::int,     null,                                  v_wk - 80, true,  'm2',     'half',         null, null, true,  'm2'),
    ('Comunidad de vecinos',          'home',           4500, false, 'monthly', extract(day from v_wk + 18)::int,    null,                                  v_wk - 80, false, 'm2',     'half',         null, 0,    true,  'm2'),
    ('Dominio web',                   'subscriptions',  4990, false, 'yearly',  extract(day from v_wk + 60)::int,    extract(month from v_wk + 60)::int,    ((v_wk + 60) - interval '1 year')::date, false, 'm1', 'half', null, 3, true, 'm1'),
    ('Matrícula del curso de inglés', 'other',         18000, false, 'once',    null,                                null,                                  v_wk + 3,  false, 'm1',     'half',         null, 1,    true,  'm1'),
    ('Regalo de boda',                'gifts',         15000, false, 'once',    null,                                null,                                  v_wk + 4,  false, 'm1',     'half',         null, 3,    true,  'm1'),
    ('Reserva casa rural',            'leisure',        8000, false, 'once',    null,                                null,                                  v_wk + 4,  false, 'm2',     'custom',       30,   0,    true,  'm2'),
    ('Revisión ITV',                  'transport',      4500, false, 'once',    null,                                null,                                  v_wk + 9,  false, 'm1',     'only_m1',      null, 1,    true,  'm1'),
    ('Entradas del concierto',        'leisure',        9000, false, 'once',    null,                                null,                                  v_wk + 29, false, 'm2',     'half',         null, 1,    true,  'm2'),
    ('Reparación de la lavadora',     'home',          13500, false, 'once',    null,                                null,                                  v_hoy - 6, false, 'm1',     'half',         null, null, true,  'm1')
  ) as x(name, category, amount, variable, freq, dom, moy, sd, paused, paid_by, split, pct, reminder, visible, who);

  -- Cobros ya vencidos (lo que habría hecho el job diario): en los últimos 100 días, de ayer hacia atrás.
  -- Fijo → cobro + gasto (el trigger del gasto lo marca «pagado»). Variable → gasto con un importe que varía.
  -- El último cobro del Gas (ayer) se queda «pendiente»: tarjeta «pon el importe».
  for r in select * from public.recurring_payments rp where rp.couple_id = v_couple order by rp.name loop
    select max(t.d) into v_ultimo
    from private.payment_due_dates(r.frequency, r.day_of_month, r.month_of_year, r.start_date, r.end_date,
                                   v_hoy - 100, v_hoy - 1) as t(d);
    for v_d in
      select t.d from private.payment_due_dates(r.frequency, r.day_of_month, r.month_of_year, r.start_date, r.end_date,
                                                v_hoy - 100, v_hoy - 1) as t(d)
      order by t.d
    loop
      insert into public.recurring_occurrences (couple_id, recurring_id, due_date)
      values (v_couple, r.id, v_d)
      returning id into v_occ;

      continue when r.is_variable and r.name = 'Gas' and v_d = v_ultimo;

      insert into public.expenses (couple_id, created_by, concept, amount_cents, currency, category, spent_on,
                                   paid_by, split_mode, split_pct_m1, visible_to_partner, recurring_occurrence_id)
      values (v_couple, r.created_by, r.name,
              case when r.is_variable
                   then greatest(100, r.amount_cents - 1000
                                      + (extract(day from v_d)::int * 731 + extract(month from v_d)::int * 389) % 2000)
                   else r.amount_cents end,
              v_currency, r.category, v_d, r.paid_by, r.split_mode, r.split_pct_m1, r.visible_to_partner, v_occ);
    end loop;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 5. Gastos (pantalla Gastos)
  -- ---------------------------------------------------------------------------
  -- Los dos que cubrirá la liquidación pendiente de confirmar.
  insert into public.expenses (couple_id, created_by, concept, amount_cents, currency, category, spent_on,
                               paid_by, split_mode, visible_to_partner)
  values (v_couple, v_m1, 'Compra semanal', 8645, v_currency, 'groceries', v_hoy - 2, 'm1', 'half', true)
  returning id into v_g_compra;
  insert into public.expenses (couple_id, created_by, concept, amount_cents, currency, category, spent_on,
                               paid_by, split_mode, visible_to_partner)
  values (v_couple, v_m1, 'Ferretería', 995, v_currency, 'home', v_hoy - 2, 'm1', 'half', true)
  returning id into v_g_ferre;

  -- El gasto de «¿Quién pagó?» del Cine (al crearlo, el trigger marca el evento como resuelto).
  insert into public.expenses (couple_id, created_by, concept, amount_cents, currency, category, spent_on,
                               paid_by, split_mode, visible_to_partner, event_id)
  values (v_couple, v_m2, 'Cine', 2400, v_currency, 'leisure', v_hoy - 4, 'm2', 'half', true, v_ev_cine);

  insert into public.expenses (couple_id, created_by, concept, amount_cents, currency, category, spent_on,
                               paid_by, split_mode, split_pct_m1, visible_to_partner, notes)
  select v_couple, case x.who when 'm1' then v_m1 else v_m2 end, x.concept, x.amount, v_currency,
         x.category::public.expense_category, x.spent_on, x.paid_by::public.party, x.split::public.split_mode,
         x.pct::smallint, x.visible, x.notes
  from (values
    -- Este mes (o los últimos días)
    ('Compra semanal',         'groceries',  6420, v_hoy - 9,  'm2'::public.party, 'half'::public.split_mode, null::integer, true,  null::text, 'm2'),
    ('Gasolina',               'transport',  5500, v_hoy - 5,  'm1',  'proportional', null, true,  null, 'm1'),
    ('Cena en el italiano',    'eating_out', 4860, v_hoy - 7,  'm2',  'custom',       40,   true,  'Invitaba yo el postre', 'm2'),
    ('Farmacia',               'health',     1235, v_hoy - 3,  'm1',  'only_m1',      null, true,  null, 'm1'),
    ('Zapatillas de correr',   'other',      7999, v_hoy - 8,  'm2',  'only_m2',      null, false, null, 'm2'),
    ('Libro',                  'leisure',    1890, v_hoy - 4,  'm1',  'only_m1',      null, false, null, 'm1'),
    ('Regalo para Laura',      'gifts',      3500, v_hoy - 6,  'm1',  'only_m2',      null, true,  null, 'm1'),
    ('Taxi al aeropuerto',     'transport',  2750, v_hoy - 10, 'm2',  'only_m1',      null, true,  null, 'm2'),
    ('Café y cruasanes',       'eating_out',  780, v_hoy,      'm2',  'half',         null, true,  null, 'm2'),
    ('Parking',                'transport',   450, v_hoy - 1,  'm1',  'half',         null, true,  null, 'm1'),
    ('Mercado',                'groceries',  3215, v_hoy - 12, 'm1',  'proportional', null, true,  null, 'm1'),
    -- Del bote (si está activo): lo paga el bote si tiene dinero; si no, lo adelanta m2 para el bote
    ('Productos de limpieza',  'home',       2375, v_hoy - 1,
       case when v_bote_paga then 'pot' when v_pot then 'm2' else 'm1' end::public.party, v_bote_modo, null, true, null,
       case when v_pot then 'm2' else 'm1' end),
    -- Adelantado por m1 para el bote (el bote le debe); sin bote, a medias
    ('Bombillas y pilas',      'home',       1540, v_hoy - 6,  'm1',  v_bote_modo,    null, true,  null, 'm1'),
    -- Meses anteriores (quedarán saldados)
    ('Compra semanal',         'groceries',  9210, v_mes - 8,  'm1',  'half',         null, true,  null, 'm1'),
    ('Cena de cumpleaños',     'eating_out',12000, v_mes - 13, 'm2',  'half',         null, true,  null, 'm2'),
    ('Entradas de teatro',     'leisure',    6000, v_mes - 18, 'm1',  'custom',       30,   true,  null, 'm1'),
    ('Seguro del hogar',       'home',      21000, v_mes - 22, 'm2',  'proportional', null, true,  null, 'm2'),
    ('Dentista',               'health',     4500, v_mes - 25, 'm2',  'only_m2',      null, true,  null, 'm2'),
    ('Vuelos a Lisboa',        'transport', 18640, v_mes - 40, 'm1',  'half',         null, true,  'Ida y vuelta', 'm1'),
    ('Supermercado',           'groceries',  7735, v_mes - 45, 'm2',  'half',         null, true,  null, 'm2'),
    ('Mueble del salón',       'home',      24900, v_mes - 50, 'm1',  'custom',       45,   true,  null, 'm1')
  ) as x(concept, category, amount, spent_on, paid_by, split, pct, visible, notes, who);

  -- ---------------------------------------------------------------------------
  -- 6. Liquidaciones (mismo cálculo que create_settlement)
  -- ---------------------------------------------------------------------------
  -- 6a. Pendiente de confirmar: m2 dice que ha pagado a m1 la compra y la ferretería (m1 ve «Confirmar»).
  select coalesce(sum(case e.paid_by when 'm1' then e.share_m2_cents when 'm2' then -e.share_m1_cents else 0 end), 0)
    into v_net
  from public.expenses e where e.id in (v_g_compra, v_g_ferre);
  v_set := gen_random_uuid();
  insert into public.settlements (id, couple_id, from_slot, to_slot, amount_cents, method, status, note, created_by)
  values (v_set, v_couple, 'm2', 'm1', v_net::integer, 'bizum', 'pending', 'Bizum de la compra', v_m2);
  update public.expenses set settlement_id = v_set where id in (v_g_compra, v_g_ferre);

  -- 6b. Confirmada: todo lo de meses anteriores que genera deuda (gastos y cobros), saldado por quien recibe.
  select count(*),
         coalesce(sum(case e.paid_by when 'm1' then e.share_m2_cents when 'm2' then -e.share_m1_cents else 0 end), 0)
    into v_n, v_net
  from public.expenses e
  where e.couple_id = v_couple and e.settlement_id is null and e.visible_to_partner and e.spent_on < v_mes
    and (case e.paid_by when 'm1' then e.share_m2_cents when 'm2' then e.share_m1_cents else 0 end) <> 0;
  if v_n > 0 then
    if v_net >= 0 then v_from := 'm2'; v_to := 'm1'; v_rcv := v_m1; else v_from := 'm1'; v_to := 'm2'; v_rcv := v_m2; end if;
    v_set := gen_random_uuid();
    insert into public.settlements (id, couple_id, from_slot, to_slot, amount_cents, method, status, note,
                                    created_by, responded_by, responded_at)
    values (v_set, v_couple, v_from, v_to, abs(v_net)::integer, 'transfer', 'confirmed', 'Cuentas del mes pasado',
            v_rcv, v_rcv, now());
    update public.expenses e set settlement_id = v_set
    where e.couple_id = v_couple and e.settlement_id is null and e.visible_to_partner and e.spent_on < v_mes
      and (case e.paid_by when 'm1' then e.share_m2_cents when 'm2' then e.share_m1_cents else 0 end) <> 0;
  end if;

  -- ---------------------------------------------------------------------------
  -- 7. Informe
  -- ---------------------------------------------------------------------------
  select coalesce(sum(x.m2_owes_m1_cents) filter (where not x.is_settled), 0),
         coalesce(sum(x.m2_owes_m1_cents) filter (where x.awaiting_confirmation), 0),
         coalesce(sum(x.amount_cents) filter (where x.paid_by = 'pot'), 0)
    into v_saldo, v_espera, v_bote_gastado
  from public.expense_effects x where x.couple_id = v_couple;

  v_inf := format(
       E'Espacio %s · hoy %s (lunes de esta semana: %s)\n'
    || E'\nBORRADO\n'
    || E'  solicitudes de borrado: %s\n  gastos: %s\n  liquidaciones: %s\n  reembolsos del bote: %s\n'
    || E'  cobros de recurrentes: %s\n  pagos recurrentes: %s\n  excepciones de eventos: %s\n  eventos: %s\n'
    || E'\nCREADO\n'
    || E'  eventos: %s (cumpleaños: %s, secretos: %s, varios días: %s)\n  excepciones: %s\n'
    || E'  pagos recurrentes/únicos: %s (en pausa: %s, privados: %s)\n'
    || E'  cobros: %s (pagados: %s, pendientes de importe: %s)\n'
    || E'  gastos: %s (de cobros: %s, privados: %s, del bote: %s)\n'
    || E'  liquidaciones: %s (pendientes: %s, confirmadas: %s)\n'
    || E'\nSALDO RESULTANTE (positivo = m2 debe a m1)\n'
    || E'  sin saldar: %s €  · de eso, pendiente de confirmar: %s €\n'
    || E'  bote: activado=%s · dinero antes de los ejemplos %s € · gastado por el bote %s €\n',
    v_couple, to_char(v_hoy, 'DD/MM/YYYY'), to_char(v_wk, 'DD/MM'),
    d_req, d_exp, d_set, d_reimb, d_occ, d_rec, d_exc, d_ev,
    (select count(*) from public.events where couple_id = v_couple),
    (select count(*) from public.events where couple_id = v_couple and category = 'birthday'),
    (select count(*) from public.events where couple_id = v_couple and is_secret),
    (select count(*) from public.events where couple_id = v_couple and end_date is not null),
    (select count(*) from public.event_exceptions where couple_id = v_couple),
    (select count(*) from public.recurring_payments where couple_id = v_couple),
    (select count(*) from public.recurring_payments where couple_id = v_couple and paused),
    (select count(*) from public.recurring_payments where couple_id = v_couple and not visible_to_partner),
    (select count(*) from public.recurring_occurrences where couple_id = v_couple),
    (select count(*) from public.recurring_occurrences where couple_id = v_couple and status = 'paid'),
    (select count(*) from public.recurring_occurrences where couple_id = v_couple and status = 'pending'),
    (select count(*) from public.expenses where couple_id = v_couple),
    (select count(*) from public.expenses where couple_id = v_couple and recurring_occurrence_id is not null),
    (select count(*) from public.expenses where couple_id = v_couple and not visible_to_partner),
    (select count(*) from public.expenses where couple_id = v_couple and (paid_by = 'pot' or split_mode = 'pot')),
    (select count(*) from public.settlements where couple_id = v_couple),
    (select count(*) from public.settlements where couple_id = v_couple and status = 'pending'),
    (select count(*) from public.settlements where couple_id = v_couple and status = 'confirmed'),
    to_char(v_saldo / 100.0, 'FM999990.00'), to_char(v_espera / 100.0, 'FM999990.00'),
    v_pot, to_char(v_bote_saldo / 100.0, 'FM999990.00'), to_char(v_bote_gastado / 100.0, 'FM999990.00'));

  select string_agg(format('  %s  %s  %s · %s · %s%s%s%s%s',
           case when ev.category = 'birthday' then to_char(ev.start_date, 'DD/MM') || '     '
                else to_char(ev.start_date, 'DD/MM/YY') end
             || coalesce('–' || to_char(ev.end_date, 'DD/MM'), ''),
           coalesce(to_char(ev.start_time, 'HH24:MI'), 'todo el día'),
           ev.title, ev.category, ev.attendees,
           case when ev.recurrence <> 'none' then ' · ' || ev.recurrence::text else '' end,
           case when ev.is_secret then ' · SECRETO' else '' end,
           case when ev.ask_who_paid then ' · ¿quién pagó?' || case when ev.who_paid_resolved_at is null then '' else ' (resuelto)' end else '' end,
           case when ev.birth_year is not null then ' · nació ' || ev.birth_year else '' end),
         E'\n' order by ev.category = 'birthday', ev.start_date, ev.start_time nulls first)
    into v_lista
  from public.events ev where ev.couple_id = v_couple;
  v_inf := v_inf || E'\nEVENTOS\n' || coalesce(v_lista, '  (ninguno)') || E'\n';

  select string_agg(format('  %s · %s · %s € · %s/%s%s%s%s · cobros: %s',
           rp.name,
           case rp.frequency when 'once' then 'único el ' || to_char(rp.start_date, 'DD/MM/YY')
                             when 'monthly' then 'cada mes, día ' || rp.day_of_month
                             else 'cada año, ' || rp.day_of_month || '/' || rp.month_of_year end,
           to_char(rp.amount_cents / 100.0, 'FM999990.00'),
           rp.paid_by, rp.split_mode,
           case when rp.is_variable then ' · variable' else '' end,
           case when rp.paused then ' · EN PAUSA' else '' end,
           case when not rp.visible_to_partner then ' · PRIVADO' else '' end,
           (select count(*) from public.recurring_occurrences o where o.recurring_id = rp.id)),
         E'\n' order by rp.frequency, rp.name)
    into v_lista
  from public.recurring_payments rp where rp.couple_id = v_couple;
  v_inf := v_inf || E'\nPAGOS\n' || coalesce(v_lista, '  (ninguno)') || E'\n';

  select string_agg(format('  %s  %s · %s € · %s/%s%s%s%s',
           to_char(e.spent_on, 'DD/MM/YY'), e.concept, to_char(e.amount_cents / 100.0, 'FM999990.00'),
           e.paid_by, e.split_mode || coalesce(' ' || e.split_pct_m1 || '%', ''),
           case when not e.visible_to_partner then ' · PRIVADO' else '' end,
           case when e.recurring_occurrence_id is not null then ' · cobro' else '' end,
           case when s.status = 'pending' then ' · pendiente de confirmar'
                when s.status = 'confirmed' then ' · saldado' else '' end),
         E'\n' order by e.spent_on desc, e.concept)
    into v_lista
  from public.expenses e left join public.settlements s on s.id = e.settlement_id
  where e.couple_id = v_couple;
  v_inf := v_inf || E'\nGASTOS\n' || coalesce(v_lista, '  (ninguno)');

  if c_modo = 'ensayo' then
    raise exception E'ENSAYO: NO SE HA GUARDADO NADA (este error lo deshace todo a propósito).\nSi el resumen está bien, cambia c_modo a ''aplicar'' y ejecuta otra vez.\n\n%', v_inf;
  end if;

  perform set_config('ito.seed_informe', E'APLICADO: los cambios se han guardado.\n\n' || v_inf, false);
end
$seed$;

-- Solo llega aquí en modo 'aplicar': el resumen, una línea por fila.
select t.linea as resultado
from regexp_split_to_table(coalesce(nullif(current_setting('ito.seed_informe', true), ''), 'No se ha aplicado nada'), E'\n')
     with ordinality as t(linea, n)
order by t.n;
