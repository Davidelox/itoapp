-- =============================================================================
-- ito · Totales del historial de gastos
-- 2026-11-17 · Ver docs/plan-gastos.md §5.
-- NO aplicada: la ejecuta David en el SQL Editor. Se puede ejecutar más de una vez.
--
-- 1. Recuento y total de los gastos filtrados del historial, sin descargarlos todos.
-- security invoker: se aplica la RLS de expenses de quien llama, así que no cuenta
-- los gastos privados de la otra persona. El texto llega ya con %, _ y \ escapados.
-- 2. Corrige un desbordamiento en private.compute_shares (revisión del arquitecto, I1).
-- =============================================================================

create or replace function public.expense_totals(
  p_category         public.expense_category   default null,
  p_query            text                      default null,
  p_query_categories public.expense_category[] default null
)
returns table (expense_count integer, total_cents bigint)
language sql stable security invoker set search_path = '' as $$
  select count(*)::integer, coalesce(sum(e.amount_cents), 0)::bigint
  from public.expenses e
  where e.couple_id = (select private.my_couple_id())
    and (p_category is null or e.category = p_category)
    and (p_query is null
         or e.concept ilike '%' || p_query || '%'
         or e.category = any (coalesce(p_query_categories, '{}')))
$$;

revoke all on function public.expense_totals(public.expense_category, text, public.expense_category[]) from public, anon;
grant execute on function public.expense_totals(public.expense_category, text, public.expense_category[]) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. private.compute_shares: «p_amount * p_pct» era integer × smallint = integer y se desbordaba
--    (error 22003) desde 429.496,72 € a medias o 214.748,36 € al 100 %. Ahora se multiplica en numeric.
--    Mismo resultado para todo lo que ya funcionaba: round() de numeric redondea las mitades hacia arriba.
--    create or replace conserva los permisos existentes.
-- -----------------------------------------------------------------------------
create or replace function private.compute_shares(p_amount integer, p_mode public.split_mode, p_pct smallint,
                                                  out m1 integer, out m2 integer, out pot integer)
language plpgsql immutable set search_path = '' as $$
begin
  m1 := 0; m2 := 0; pot := 0;
  case p_mode
    when 'pot'     then pot := p_amount;
    when 'only_m1' then m1 := p_amount;
    when 'only_m2' then m2 := p_amount;
    else
      m1 := round(p_amount::numeric * p_pct / 100)::integer;
      m2 := p_amount - m1;
  end case;
end $$;
