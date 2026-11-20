-- =============================================================================
-- ito · Sitios de ejemplo para el Mapa (solo para probar la app)
-- 2026-11-20 · NO es una migración: no la muevas a supabase/migrations/. Se ejecuta a mano en el SQL Editor.
--
-- Qué hace, en el espacio (couple) elegido:
--   1. BORRA todos los sitios (`places`; sus notas se borran en cascada). Los eventos y gastos que los usaran
--      quedan sin sitio (FK `on delete set null`).
--   2. CREA 8 sitios de ejemplo (Madrid y alrededores) con valoraciones: uno privado de cada persona.
-- MODO: 'ensayo' (por defecto) lanza un error a propósito que lo deshace todo; 'aplicar' lo guarda.
-- =============================================================================

do $seed$
declare
  c_modo   constant text := 'ensayo';  -- 'ensayo' (no guarda nada) o 'aplicar' (guarda)
  v_couple uuid := null;               -- null = el único espacio que haya; si hay varios, pon aquí el id del tuyo
  v_m1 uuid;
  v_m2 uuid;
  v_n integer;
begin
  if v_couple is null then
    select count(*) into v_n from public.couples;
    if v_n <> 1 then
      raise exception 'Hay % espacios. Pon el id del tuyo en v_couple (arriba) y vuelve a ejecutar.', v_n;
    end if;
    select c.id into v_couple from public.couples c;
  end if;
  select m.user_id into v_m1 from public.couple_members m where m.couple_id = v_couple and m.slot = 'm1' and m.left_at is null;
  select m.user_id into v_m2 from public.couple_members m where m.couple_id = v_couple and m.slot = 'm2' and m.left_at is null;
  if v_m1 is null or v_m2 is null then
    raise exception 'El espacio % necesita a las dos personas activas (m1 y m2).', v_couple;
  end if;

  delete from public.places where couple_id = v_couple;

  insert into public.places (couple_id, name, address, lat, lng, provider, category, status, visible_to_partner, created_by, created_at)
  select v_couple, x.name, x.address, x.lat, x.lng, 'manual', x.category::public.place_category, x.status::public.place_status,
         x.visible, case when x.autor = 1 then v_m1 else v_m2 end, now() - x.antiguedad
  from (values
    ('Taberna El Olivo',        'Calle Mayor 12, Madrid',        40.4155, -3.7074, 'restaurant', 'been',       true,  1, interval '40 days'),
    ('Bar La Latina',           'Cava Baja 24, Madrid',          40.4119, -3.7093, 'bar',        'want_to_go', true,  2, interval '20 days'),
    ('Café del Parque',         'Paseo del Prado 8, Madrid',     40.4139, -3.6921, 'cafe',       'been',       true,  2, interval '15 days'),
    ('Cines Verdi',             'Calle Bravo Murillo 28, Madrid',40.4339, -3.7031, 'leisure',    'want_to_go', true,  1, interval '10 days'),
    ('Casa rural La Sierra',    'Cercedilla, Madrid',            40.7358, -4.0561, 'getaway',    'want_to_go', true,  1, interval '8 days'),
    ('Hotel Costa Brava',       'Calella de Palafrugell, Girona',41.8942,  3.1855, 'getaway',    'been',       true,  2, interval '90 days'),
    ('Restaurante sorpresa',    'Calle Fuencarral 70, Madrid',   40.4268, -3.7019, 'restaurant', 'want_to_go', false, 1, interval '3 days'),
    ('Regalo de aniversario',   'Calle Serrano 40, Madrid',      40.4318, -3.6872, 'other',      'want_to_go', false, 2, interval '2 days')
  ) as x(name, address, lat, lng, category, status, visible, autor, antiguedad);

  insert into public.place_notes (place_id, couple_id, user_id, rating, note)
  select p.id, v_couple, u.uid, n.rating, n.note
  from (values
    ('Taberna El Olivo', 1, 4.5, 'Las croquetas, sí o sí.'),
    ('Taberna El Olivo', 2, 4.0, null),
    ('Café del Parque',  2, 3.5, 'Bonito, pero lleno los domingos.'),
    ('Hotel Costa Brava',1, 5.0, null),
    ('Hotel Costa Brava',2, 4.5, 'Volveríamos mañana.')
  ) as n(nombre, quien, rating, note)
  join public.places p on p.couple_id = v_couple and p.name = n.nombre
  join lateral (select case when n.quien = 1 then v_m1 else v_m2 end as uid) u on true;

  if c_modo = 'ensayo' then
    raise exception 'ENSAYO: NO SE HA GUARDADO NADA (este error lo deshace todo a propósito). Cambia c_modo a ''aplicar'' para guardar.';
  end if;
end
$seed$;
