-- =============================================================================
-- ito · Ajustes (docs/plan-ajustes.md §6)
--   1. Propuestas de cambio: solo columnas de dinero conocidas y coherentes (TW031, TW032).
--   2. I4: al activar el bote mensual, pot_started_on es como mínimo «hoy» en la zona de la pareja,
--      así el job no crea de golpe las aportaciones de los meses en que estuvo apagado.
--      Va en el trigger de couple_settings: cubre la edición directa (solo en el espacio) y las propuestas.
--   3. M6: sin cambios en el servidor. Con el bote desactivado se puede seguir reembolsando
--      (reimburse_from_pot no mira pot_enabled) y editar un gasto antiguo del bote sin cambiar
--      quién pagó ni el reparto (expenses_before_write solo mira pot_enabled si cambian).
-- Idempotente: se puede volver a ejecutar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Qué se puede proponer
-- -----------------------------------------------------------------------------

-- Columnas de couple_settings que se pueden cambiar con una propuesta. pot_started_on la pone el servidor.
create or replace function private.settings_proposable_keys() returns text[]
language sql immutable set search_path = '' as $$
  select array['default_split', 'proportional_pct_m1', 'pot_enabled', 'pot_categories',
               'pot_funding', 'pot_monthly_cents', 'pot_day', 'pot_pct_m1'];
$$;

-- Comprueba que unos ajustes son coherentes (mismo criterio que los CHECK, con mensajes claros).
create or replace function private.check_settings(s public.couple_settings) returns void
language plpgsql set search_path = '' as $$
begin
  -- jsonb_populate_record deja pasar null y no mira los CHECK de columna: se comprueba aquí para que una
  -- propuesta mal formada se rechace al proponer y no falle con un error genérico al aceptarla.
  if s.default_split is null or s.proportional_pct_m1 is null or s.pot_enabled is null or s.pot_categories is null
     or array_position(s.pot_categories, null) is not null or s.pot_funding is null or s.pot_pct_m1 is null
     or (s.pot_monthly_cents is not null and s.pot_monthly_cents <= 0) then
    raise exception 'Valores no válidos' using errcode = 'TW032';
  end if;
  if not s.pot_enabled and s.default_split in ('mixed', 'all_pot') then
    raise exception 'Sin bote común no puede haber reparto Mixto ni Todo al bote' using errcode = 'TW032';
  end if;
  if s.pot_enabled and s.pot_funding = 'monthly'
     and (s.pot_monthly_cents is null or s.pot_monthly_cents <= 0 or s.pot_day is null) then
    raise exception 'La aportación mensual necesita importe y día' using errcode = 'TW032';
  end if;
  if s.proportional_pct_m1 not between 0 and 100 or s.pot_pct_m1 not between 0 and 100
     or (s.pot_day is not null and s.pot_day not between 1 and 31) then
    raise exception 'Valores fuera de rango' using errcode = 'TW032';
  end if;
end $$;

-- Al proponer: solo columnas conocidas, al menos una, y que el resultado tenga sentido hoy.
create or replace function private.settings_proposals_before_insert() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_old public.couple_settings;
  v_new public.couple_settings;
  v_key text;
begin
  for v_key in select jsonb_object_keys(new.changes) loop
    if not (v_key = any (private.settings_proposable_keys())) then
      raise exception 'Ese ajuste no se puede proponer: %', v_key using errcode = 'TW031';
    end if;
  end loop;
  if new.changes = '{}'::jsonb then
    raise exception 'La propuesta no cambia nada' using errcode = 'TW031';
  end if;
  select * into v_old from public.couple_settings s where s.couple_id = new.couple_id;
  begin
    v_new := jsonb_populate_record(v_old, new.changes);
  exception when others then
    raise exception 'Propuesta no válida' using errcode = 'TW031';
  end;
  perform private.check_settings(v_new);
  return new;
end $$;

-- Los usa el trigger de alta, que corre con el rol del cliente.
revoke all on function private.settings_proposable_keys() from public, anon;
revoke all on function private.check_settings(public.couple_settings) from public, anon;
grant execute on function private.settings_proposable_keys() to authenticated;
grant execute on function private.check_settings(public.couple_settings) to authenticated;
-- La función del trigger no se concede a nadie (los triggers no comprueban EXECUTE al dispararse).
revoke all on function private.settings_proposals_before_insert() from public, anon, authenticated;

drop trigger if exists a_validate on public.settings_proposals;
create trigger a_validate before insert on public.settings_proposals
  for each row execute function private.settings_proposals_before_insert();

-- -----------------------------------------------------------------------------
-- 2. Aceptar o rechazar una propuesta
--    Se aplican solo las columnas propuestas sobre los ajustes actuales (sin control de versión: el job
--    mensual sube version y no debe provocar conflictos, M8). Si algo cambió y ya no encaja, TW032.
-- -----------------------------------------------------------------------------

create or replace function public.respond_settings_proposal(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_couple uuid := private.my_couple_id();
  v_prop   public.settings_proposals;
  v_old    public.couple_settings;
  v_new    public.couple_settings;
begin
  select * into v_prop from public.settings_proposals p where p.id = p_id and p.couple_id = v_couple for update;
  if not found or v_prop.status <> 'pending' then
    raise exception 'Propuesta no encontrada o ya respondida' using errcode = 'TW030';
  elsif v_prop.proposed_by = v_uid then
    raise exception 'No puedes aceptar tu propia propuesta' using errcode = 'TW030';
  end if;

  if p_accept then
    select * into v_old from public.couple_settings s where s.couple_id = v_couple for update;
    -- Solo las columnas que se pueden proponer (el trigger de alta ya lo exige; se repite por si acaso).
    v_new := jsonb_populate_record(v_old, (
      select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
      from jsonb_each(v_prop.changes) as e(k, v)
      where k = any (private.settings_proposable_keys())));
    perform private.check_settings(v_new);
    update public.couple_settings set
      default_split       = v_new.default_split,
      proportional_pct_m1 = v_new.proportional_pct_m1,
      pot_enabled         = v_new.pot_enabled,
      pot_categories      = v_new.pot_categories,
      pot_funding         = v_new.pot_funding,
      pot_monthly_cents   = v_new.pot_monthly_cents,
      pot_day             = v_new.pot_day,
      pot_pct_m1          = v_new.pot_pct_m1
    where couple_id = v_couple;
  end if;

  update public.settings_proposals
     set status = case when p_accept then 'accepted' else 'rejected' end::public.proposal_status,
         decided_by = v_uid, decided_at = now()
   where id = p_id;
end $$;

revoke all on function public.respond_settings_proposal(uuid, boolean) from public, anon;
grant execute on function public.respond_settings_proposal(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- 3. I4: inicio de la aportación automática
-- -----------------------------------------------------------------------------

create or replace function private.settings_before_update() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_today date;
begin
  if new.couple_id <> old.couple_id then
    raise exception 'No se puede cambiar la pareja' using errcode = 'TW040';
  end if;
  new.updated_by := coalesce(auth.uid(), old.updated_by);

  if new.pot_funding = 'monthly' then
    select (now() at time zone c.time_zone)::date into v_today from public.couples c where c.id = new.couple_id;
    v_today := coalesce(v_today, current_date);
    if new.pot_enabled and not (old.pot_enabled and old.pot_funding = 'monthly') then
      -- Se activa ahora: nunca antes de hoy (los meses apagados no generan aportación).
      new.pot_started_on := greatest(coalesce(new.pot_started_on, v_today), v_today);
    elsif new.pot_enabled and (new.pot_started_on is null or new.pot_started_on < old.pot_started_on) then
      -- Ya estaba activa: no se puede adelantar el inicio para generar meses pasados.
      new.pot_started_on := coalesce(old.pot_started_on, v_today);
    elsif new.pot_started_on is null then
      -- Mensual con el bote apagado: el CHECK exige fecha. Al reactivarlo se vuelve a fijar a «hoy».
      new.pot_started_on := v_today;
    end if;
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 4. Salir del espacio cierra las propuestas pendientes
--    Si no, quien vuelve (o quien se queda) podría aceptar semanas después cambios ya viejos.
--    Igual que leave_couple del esquema inicial, con la línea de settings_proposals.
-- -----------------------------------------------------------------------------

create or replace function public.leave_couple() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_couple uuid := private.my_couple_id();
begin
  if v_couple is null then
    raise exception 'No perteneces a ninguna pareja' using errcode = 'TW001';
  end if;
  delete from public.expenses           where couple_id = v_couple and created_by = v_uid and not visible_to_partner;
  delete from public.recurring_payments where couple_id = v_couple and created_by = v_uid and not visible_to_partner;
  delete from public.places             where couple_id = v_couple and created_by = v_uid and not visible_to_partner;
  delete from public.collections        where couple_id = v_couple and created_by = v_uid and not visible_to_partner;
  delete from public.events             where couple_id = v_couple and created_by = v_uid and is_secret;
  delete from public.push_tokens        where user_id = v_uid;
  -- Las solicitudes pendientes se cancelan: quien se queda podrá borrar sin aprobación.
  update public.deletion_requests set status = 'cancelled', decided_at = now()
  where couple_id = v_couple and status = 'pending';
  -- Las propuestas de ajustes pendientes, de cualquiera de los dos, desaparecen.
  delete from public.settings_proposals where couple_id = v_couple and status = 'pending';
  update public.couple_members set left_at = now() where couple_id = v_couple and user_id = v_uid;
  update public.couple_invitations set revoked_at = now()
  where couple_id = v_couple and used_at is null and revoked_at is null;
  if private.active_member_count(v_couple) = 0 then
    delete from public.couples where id = v_couple;
  end if;
end $$;

revoke all on function public.leave_couple() from public, anon;
grant execute on function public.leave_couple() to authenticated;

-- -----------------------------------------------------------------------------
-- 5. Zona horaria válida
--    couples_update deja a los miembros cambiarla; una zona inválida rompería el job diario de todas
--    las parejas. Se comprueba contra las zonas que conoce Postgres.
-- -----------------------------------------------------------------------------

create or replace function private.couples_check_time_zone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone) then
    raise exception 'Zona horaria no válida: %', new.time_zone using errcode = 'TW033';
  end if;
  return new;
end $$;
revoke all on function private.couples_check_time_zone() from public, anon;

drop trigger if exists a_time_zone on public.couples;
create trigger a_time_zone before insert or update of time_zone on public.couples
  for each row execute function private.couples_check_time_zone();
