-- =============================================================================
-- ito · Pagos recurrentes (docs/plan-gastos-fase4.md §3)
--   1. Pausa: al reanudar no se cobran los días de la pausa. Nueva columna active_from, que pone el
--      servidor («hoy» en la zona de la pareja) al crear, al reanudar y al cambiar la frecuencia; el job
--      no crea cobros anteriores.
--   2. Cobros (recurring_occurrences): el cliente ya no puede crearlos ni marcarlos como pagados. Solo
--      puede saltar un cobro pendiente o deshacer el salto; «pagado» lo pone el trigger del gasto.
--      Un gasto solo se enlaza a un cobro al crearlo, y solo a uno que quien escribe puede ver.
--   3. Job diario: cada pareja del paso 1 (bote) va aislada, como ya lo estaba el paso 2: un error en
--      una no para a las demás. Como mucho un cobro por mes (mensual), año (anual) o en total (una vez):
--      cambiar el día tras un cobro no cobra dos veces ese mes.
-- Idempotente: se puede volver a ejecutar.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. active_from
-- -----------------------------------------------------------------------------

alter table public.recurring_payments add column if not exists active_from date;

-- Los que ya existen: desde el día en que se crearon (lo mismo que usaba el job).
update public.recurring_payments rp
   set active_from = (rp.created_at at time zone c.time_zone)::date
  from public.couples c
 where c.id = rp.couple_id and rp.active_from is null;
alter table public.recurring_payments alter column active_from set not null;

-- «Hoy» en la zona de la pareja.
create or replace function private.couple_today(p_couple uuid) returns date
language sql stable set search_path = '' as $$
  select coalesce((select (now() at time zone c.time_zone)::date from public.couples c where c.id = p_couple), current_date);
$$;
revoke all on function private.couple_today(uuid) from public, anon;
grant execute on function private.couple_today(uuid) to authenticated;

-- Recurrentes: % por defecto, privado solo si es propio, bote activado y active_from (nunca lo elige el cliente).
create or replace function private.recurring_before_write() returns trigger
language plpgsql set search_path = '' as $$
declare v_pot boolean;
begin
  if new.split_mode = 'half' then
    new.split_pct_m1 := 50;
  elsif new.split_mode = 'proportional' and new.split_pct_m1 is null then
    select s.proportional_pct_m1 into new.split_pct_m1 from public.couple_settings s where s.couple_id = new.couple_id;
  elsif new.split_mode not in ('proportional', 'custom') then
    new.split_pct_m1 := null;
  end if;
  if not new.visible_to_partner and new.paid_by is distinct from private.slot_of(new.couple_id, new.created_by) then
    raise exception 'Un pago privado tiene que ser solo tuyo y pagado por ti' using errcode = 'TW011';
  end if;
  if (new.paid_by = 'pot' or new.split_mode = 'pot')
     and (tg_op = 'INSERT' or new.paid_by <> old.paid_by or new.split_mode <> old.split_mode) then
    select s.pot_enabled into v_pot from public.couple_settings s where s.couple_id = new.couple_id;
    if not coalesce(v_pot, false) then
      raise exception 'El bote común no está activado' using errcode = 'TW012';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.active_from := private.couple_today(new.couple_id);
  elsif (old.paused and not new.paused) or new.frequency <> old.frequency then
    -- Se reanuda (lo que venció durante la pausa no se cobra) o cambia la frecuencia (los cobros de la
    -- frecuencia anterior no cuentan para «uno por periodo» del job).
    new.active_from := greatest(old.active_from, private.couple_today(new.couple_id));
  else
    new.active_from := old.active_from;
  end if;
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Cobros: sin alta desde el cliente; al editar, solo pendiente ↔ saltado
-- -----------------------------------------------------------------------------

drop policy if exists recurring_occurrences_insert on public.recurring_occurrences;
revoke insert on public.recurring_occurrences from authenticated, anon;

create or replace function private.occurrences_before_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_client_write() then
    if new.couple_id <> old.couple_id or new.recurring_id <> old.recurring_id or new.due_date <> old.due_date
       or new.amount_cents is distinct from old.amount_cents then
      raise exception 'Solo se puede saltar un cobro o deshacer el salto' using errcode = 'TW080';
    end if;
    if not ((old.status = 'pending' and new.status = 'skipped') or (old.status = 'skipped' and new.status = 'pending')
            or new.status = old.status) then
      raise exception 'Este cobro ya está pagado: borra su gasto para cambiarlo' using errcode = 'TW081';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.occurrences_before_update() from public, anon;

drop trigger if exists a_guard on public.recurring_occurrences;
create trigger a_guard before update on public.recurring_occurrences
  for each row execute function private.occurrences_before_update();

-- Gastos: el cliente solo enlaza un cobro al crear el gasto (poner importe), y solo uno que ve. Sin security
-- definer: la RLS de recurring_occurrences (y la de su recurrente) decide. La FK no basta: no mira la RLS,
-- así que sin esto se podría marcar como pagado el cobro de un recurrente privado de la otra persona.
create or replace function private.expenses_check_occurrence() returns trigger
language plpgsql set search_path = '' as $$
begin
  if private.is_client_write() then
    if tg_op = 'UPDATE' and new.recurring_occurrence_id is distinct from old.recurring_occurrence_id then
      raise exception 'Un gasto no se puede enlazar a otro cobro' using errcode = 'TW082';
    end if;
    if tg_op = 'INSERT' and new.recurring_occurrence_id is not null
       and not exists (select 1 from public.recurring_occurrences o
                       where o.id = new.recurring_occurrence_id and o.couple_id = new.couple_id) then
      raise exception 'Cobro no encontrado' using errcode = 'TW082';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.expenses_check_occurrence() from public, anon;

drop trigger if exists a_occurrence on public.expenses;
create trigger a_occurrence before insert or update on public.expenses
  for each row execute function private.expenses_check_occurrence();

-- -----------------------------------------------------------------------------
-- 3. Job diario: active_from en el paso 2 y cada pareja aislada en el paso 1
-- -----------------------------------------------------------------------------

create or replace function private.run_daily_jobs() returns void
language plpgsql security definer set search_path = '' as $$
declare
  s       record;
  r       record;
  v_today date;
  v_month date;
  v_due   date;
  v_m1    integer;
  v_d     date;
  v_occ   uuid;
begin
  -- 0) Solicitudes de borrado caducadas (7 días sin respuesta): el elemento se queda.
  update public.deletion_requests set status = 'expired', decided_at = now()
  where status = 'pending' and expires_at <= now();

  -- 1) Aportación automática al bote: un movimiento por persona y mes, desde pot_started_on.
  for s in
    select cs.*, c.time_zone
    from public.couple_settings cs join public.couples c on c.id = cs.couple_id
    where cs.pot_enabled and cs.pot_funding = 'monthly'
  loop
    begin
      v_today := (now() at time zone s.time_zone)::date;
      v_month := coalesce((s.pot_generated_through + interval '1 month')::date,
                          date_trunc('month', s.pot_started_on::timestamp)::date);
      while v_month <= date_trunc('month', v_today::timestamp)::date loop
        v_due := private.clamp_day(v_month, s.pot_day);
        exit when v_due > v_today;
        if v_due >= s.pot_started_on then
          v_m1 := round(s.pot_monthly_cents * s.pot_pct_m1 / 100.0);
          insert into public.pot_movements (couple_id, kind, member_slot, amount_cents, occurred_on, is_auto, period)
          select s.couple_id, 'contribution', x.slot, x.amount, v_due, true, v_month
          from (values ('m1'::public.party, v_m1), ('m2'::public.party, s.pot_monthly_cents - v_m1)) as x(slot, amount)
          where x.amount > 0
          on conflict do nothing;
        end if;
        update public.couple_settings set pot_generated_through = v_month where couple_id = s.couple_id;
        v_month := (v_month + interval '1 month')::date;
      end loop;
    exception when others then
      raise warning 'run_daily_jobs: bote de %: %', s.couple_id, sqlerrm;
    end;
  end loop;

  -- 2) Cobros recurrentes vencidos (ventana de 31 días para recuperar días sin ejecutar), nunca antes de
  --    active_from (creación, última reanudación o cambio de frecuencia), y como mucho uno por periodo desde
  --    active_from (mes, año o, si es puntual, uno en total; los saltados cuentan): si se cambia el día después
  --    de un cobro, ese mes no se cobra otra vez.
  --    Importe fijo → se crea el gasto. Importe variable → queda pendiente de que alguien ponga el importe.
  for r in
    select rp.*, c.time_zone, c.currency
    from public.recurring_payments rp join public.couples c on c.id = rp.couple_id
    where not rp.paused
  loop
    v_today := (now() at time zone r.time_zone)::date;
    for v_d in
      select d.d
      from private.payment_due_dates(r.frequency, r.day_of_month, r.month_of_year, r.start_date, r.end_date,
                                     greatest(v_today - 31, (r.created_at at time zone r.time_zone)::date, r.active_from),
                                     v_today) as d(d)
      where not exists (
        select 1 from public.recurring_occurrences o
        where o.recurring_id = r.id and o.due_date <> d.d and o.due_date >= r.active_from
          and (r.frequency = 'once'
               or (r.frequency = 'monthly' and date_trunc('month', o.due_date::timestamp) = date_trunc('month', d.d::timestamp))
               or (r.frequency = 'yearly' and extract(year from o.due_date) = extract(year from d.d))))
    loop
      begin
        v_occ := null;
        insert into public.recurring_occurrences (couple_id, recurring_id, due_date)
        values (r.couple_id, r.id, v_d)
        on conflict (recurring_id, due_date) do nothing
        returning id into v_occ;

        if v_occ is not null and not r.is_variable then
          insert into public.expenses (couple_id, created_by, concept, amount_cents, currency, category, spent_on,
                                       paid_by, split_mode, split_pct_m1, visible_to_partner, recurring_occurrence_id)
          values (r.couple_id, r.created_by, r.name, r.amount_cents, r.currency, r.category, v_d,
                  r.paid_by, r.split_mode, r.split_pct_m1, r.visible_to_partner, v_occ);
        end if;
      exception when others then
        raise warning 'run_daily_jobs: recurrente % (%): %', r.id, v_d, sqlerrm;
      end;
    end loop;
  end loop;
end $$;

revoke all on function private.run_daily_jobs() from public, anon, authenticated;
