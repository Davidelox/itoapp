-- =============================================================================
-- ito · Movimientos del bote sin edición directa
-- 2026-11-17 · Ver docs/plan-gastos-fase3.md §5.
-- NO aplicada: la ejecuta David en el SQL Editor. Se puede ejecutar más de una vez.
--
-- La política pot_movements_update dejaba a cualquiera de los dos cambiar el importe de cualquier
-- movimiento del bote (también las aportaciones automáticas) sin aprobación, mientras que borrarlo sí
-- la pide. Se quita: para corregir un movimiento se pide borrarlo (request_deletion) y se apunta de nuevo.
-- El job diario no se ve afectado (es security definer).
-- =============================================================================
drop policy if exists pot_movements_update on public.pot_movements;
revoke update on public.pot_movements from authenticated;

-- -----------------------------------------------------------------------------
-- Reembolsos solo por RPC y nunca más de lo que el bote debe (revisión del arquitecto, fase 3, C1).
-- Antes el límite solo lo comprobaba la app: dos reembolsos a la vez devolvían dos veces la misma deuda,
-- y por la API se podía apuntar cualquier reembolso o ajuste. Ahora el cliente solo inserta aportaciones.
-- -----------------------------------------------------------------------------
drop policy if exists pot_movements_insert on public.pot_movements;
create policy pot_movements_insert on public.pot_movements for insert to authenticated
  with check (couple_id = (select private.my_couple_id()) and not is_auto and kind = 'contribution');

create or replace function public.reimburse_from_pot(p_id uuid, p_slot public.party, p_cents integer, p_on date)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_couple uuid := private.my_couple_id();
  v_row    public.pot_movements;
  v_owed   bigint;
begin
  if v_couple is null then
    raise exception 'No perteneces a ninguna pareja' using errcode = 'TW001';
  end if;
  if p_slot is null or p_slot = 'pot' then
    raise exception 'Reembolso no válido' using errcode = 'TW070';
  end if;

  -- Idempotencia: el mismo id con los mismos datos es un reintento; con otros datos, un error.
  select * into v_row from public.pot_movements m where m.id = p_id;
  if found then
    if v_row.couple_id = v_couple and v_row.kind = 'reimbursement'
       and v_row.member_slot = p_slot and v_row.amount_cents = p_cents then
      return;
    end if;
    raise exception 'Ya se había guardado otro movimiento con este id' using errcode = 'TW071';
  end if;

  -- Serializa los reembolsos de la pareja: dos a la vez no pueden pagar dos veces la misma deuda.
  perform 1 from public.couple_settings s where s.couple_id = v_couple for update;

  select coalesce((select sum(e.share_pot_cents) from public.expenses e
                   where e.couple_id = v_couple and e.paid_by = p_slot), 0)
       - coalesce((select sum(m.amount_cents) from public.pot_movements m
                   where m.couple_id = v_couple and m.kind = 'reimbursement' and m.member_slot = p_slot), 0)
    into v_owed;

  if p_cents is null or p_cents <= 0 or p_cents > v_owed then
    raise exception 'El bote no debe tanto' using errcode = 'TW070';
  end if;

  insert into public.pot_movements (id, couple_id, kind, member_slot, amount_cents, occurred_on, created_by)
  values (p_id, v_couple, 'reimbursement', p_slot, p_cents, coalesce(p_on, current_date), auth.uid());
end $$;

revoke all on function public.reimburse_from_pot(uuid, public.party, integer, date) from public, anon;
grant execute on function public.reimburse_from_pot(uuid, public.party, integer, date) to authenticated;
