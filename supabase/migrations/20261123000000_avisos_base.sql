-- =============================================================================
-- ito · Avisos push, fase 1: servidor base (docs/plan-avisos-push.md §3 y §5)
--
-- Qué hace:
--   1. Tokens: el cliente deja de escribir push_tokens; usa register_push_token / unregister_push_token.
--   2. Preferencias nuevas: notify_events y notify_requests.
--   3. Cola (push_outbox) y tickets (push_tickets), sin acceso del cliente.
--   4. private.enqueue_push, private.avisos_tick y las funciones que usa la Edge Function (service_role).
--   5. send_test_push («Probar aviso»).
--   6. Cron: ito-avisos (cada minuto) e ito-avisos-limpieza (diario).
--
-- Requisitos (ver supabase/functions/enviar-avisos/LEEME.md): extensiones pg_cron y pg_net activadas y
-- los secretos avisos_url y avisos_secret en Vault. Sin ellos la migración se aplica igual, pero no se
-- programa el cron (se avisa con un NOTICE) y los avisos no salen.
--
-- Es idempotente: se puede ejecutar más de una vez. La parte A (cambios) va en una transacción propia
-- y la parte B (pruebas) acaba en ROLLBACK sin deshacer la parte A.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. Preferencias de avisos
-- -----------------------------------------------------------------------------
alter table public.couple_members
  add column if not exists notify_events   boolean not null default true,
  add column if not exists notify_requests boolean not null default true;

-- -----------------------------------------------------------------------------
-- 2. Cola y tickets (solo las toca el servidor: RLS activada y sin políticas)
-- -----------------------------------------------------------------------------
create table if not exists public.push_outbox (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  couple_id   uuid not null references public.couples (id) on delete cascade,
  kind        text not null check (kind in ('event', 'birthday', 'payment_due', 'variable_amount', 'who_paid',
                                            'deletion_request', 'settings_proposal', 'settlement',
                                            'partner_expense', 'test')),
  dedupe_key  text not null unique,                 -- evita duplicados aunque el cron se solape o se repita
  title       text not null check (char_length(title) <= 200),
  body        text not null check (char_length(body) <= 500),
  url         text check (char_length(url) <= 300), -- ruta interna que se abre al tocar el aviso
  send_after  timestamptz not null default now(),
  status      text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed')),
  attempts    smallint not null default 0,
  last_error  text,
  claimed_at  timestamptz,                          -- cuándo pasó a 'sending' (para recuperar las atascadas)
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index if not exists push_outbox_status_idx  on public.push_outbox (status, send_after);
create index if not exists push_outbox_user_idx    on public.push_outbox (user_id);
create index if not exists push_outbox_couple_idx  on public.push_outbox (couple_id);
create index if not exists push_outbox_created_idx on public.push_outbox (created_at);

create table if not exists public.push_tickets (
  ticket_id     text primary key,
  outbox_id     uuid not null references public.push_outbox (id) on delete cascade,
  token         text not null,
  receipt_tries smallint not null default 0,
  created_at    timestamptz not null default now(),
  checked_at    timestamptz
);
create index if not exists push_tickets_outbox_idx  on public.push_tickets (outbox_id);
create index if not exists push_tickets_pending_idx on public.push_tickets (created_at) where checked_at is null;

alter table public.push_outbox  enable row level security;
alter table public.push_tickets enable row level security;
revoke all on table public.push_outbox, public.push_tickets from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Tokens: el cliente ya no inserta ni actualiza; usa las RPC
-- -----------------------------------------------------------------------------
-- Se quedan select y delete propios (política push_tokens_own, que sigue vigente).
revoke insert, update on public.push_tokens from authenticated;

-- Registra (o reasigna a quien llama) el token de este dispositivo. Si en el móvil entró otra cuenta,
-- el token pasa a la nueva. Como mucho 10 tokens por usuario: se borran los más antiguos.
create or replace function public.register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sin sesión' using errcode = '28000';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$' then
    raise exception 'Token no válido' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'Plataforma no válida' using errcode = '22023';
  end if;

  insert into public.push_tokens (token, user_id, platform)
  values (p_token, v_uid, p_platform)
  on conflict (token) do update
    set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();

  delete from public.push_tokens
  where user_id = v_uid
    and token in (select t.token from public.push_tokens t
                  where t.user_id = v_uid
                  order by t.updated_at desc, t.token
                  offset 10);
end $$;

-- Olvida el token de este dispositivo (al cerrar sesión). Solo borra si es de quien llama.
create or replace function public.unregister_push_token(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Sin sesión' using errcode = '28000';
  end if;
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
end $$;

-- -----------------------------------------------------------------------------
-- 4. Encolar un aviso para una persona
-- -----------------------------------------------------------------------------
-- Inserta solo si p_user es miembro activo de p_couple y tiene activada la preferencia p_pref
-- (columna notify_* de couple_members; null = sin preferencia, p. ej. el aviso de prueba).
-- Devuelve true si ha encolado algo (false: no es miembro, lo tiene desactivado o ya estaba encolado).
create or replace function private.enqueue_push(
  p_user uuid, p_couple uuid, p_kind text, p_key text,
  p_title text, p_body text, p_url text, p_pref text
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_ok boolean;
  v_n  integer;
begin
  if p_pref is not null then
    if p_pref not in ('notify_payment_reminder', 'notify_events', 'notify_who_paid',
                      'notify_partner_expense', 'notify_settlements', 'notify_requests') then
      raise exception 'Preferencia de aviso desconocida: %', p_pref using errcode = '22023';
    end if;
    execute format('select m.%I from public.couple_members m where m.couple_id = $1 and m.user_id = $2 and m.left_at is null', p_pref)
      into v_ok using p_couple, p_user;
  else
    select true into v_ok from public.couple_members m
    where m.couple_id = p_couple and m.user_id = p_user and m.left_at is null;
  end if;
  if v_ok is not true then
    return false;
  end if;

  insert into public.push_outbox (user_id, couple_id, kind, dedupe_key, title, body, url)
  values (p_user, p_couple, p_kind, p_key, p_title, p_body, p_url)
  on conflict (dedupe_key) do nothing;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

-- «Probar aviso»: un aviso a uno mismo (como mucho uno por minuto). Devuelve false si ya hay uno de este minuto.
create or replace function public.send_test_push() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_couple uuid := private.my_couple_id();
begin
  if v_uid is null then
    raise exception 'Sin sesión' using errcode = '28000';
  end if;
  if v_couple is null then
    raise exception 'No perteneces a ninguna pareja' using errcode = 'TW001';
  end if;
  return private.enqueue_push(v_uid, v_couple, 'test', 'test:' || v_uid || ':' || to_char(now(), 'YYYYMMDDHH24MI'),
                              'Aviso de prueba', 'Si lo ves, los avisos de ito funcionan.', '/ajustes', null);
end $$;

-- -----------------------------------------------------------------------------
-- 5. Funciones de la Edge Function (solo service_role)
-- -----------------------------------------------------------------------------
-- Reserva avisos listos: devuelve cada uno con los tokens de su usuario. Las atascadas en 'sending'
-- (la función se cayó) vuelven a la cola, o a 'failed' si ya agotaron los 4 intentos.
create or replace function public.push_claim(p_limit integer default 200) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_res jsonb;
begin
  update public.push_outbox
     set status = case when attempts >= 4 then 'failed' else 'queued' end,
         last_error = 'sin_respuesta', claimed_at = null
   where status = 'sending' and claimed_at < now() - interval '10 minutes';

  with c as (
    select o.id from public.push_outbox o
    where o.status = 'queued' and o.send_after <= now()
    order by o.send_after, o.created_at
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
    for update skip locked
  ), u as (
    update public.push_outbox o
       set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
      from c where o.id = c.id
    returning o.id, o.user_id, o.title, o.body, o.url, o.attempts
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', u.id, 'title', u.title, 'body', u.body, 'url', u.url, 'attempts', u.attempts,
           'tokens', (select coalesce(jsonb_agg(t.token order by t.token), '[]'::jsonb)
                      from public.push_tokens t where t.user_id = u.user_id))), '[]'::jsonb)
    into v_res
    from u;
  return v_res;
end $$;

-- Cierra los avisos reservados. p_result = [{ id, status: 'sent'|'retry'|'failed', error, delay_min,
--   tickets: [{ticket_id, token}], dead_tokens: [token] }]. Solo toca filas en 'sending'.
create or replace function public.push_finish(p_result jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r          record;
  v_attempts smallint;
begin
  for r in
    select * from jsonb_to_recordset(coalesce(p_result, '[]'::jsonb))
      as x(id uuid, status text, error text, delay_min integer, tickets jsonb, dead_tokens jsonb)
  loop
    delete from public.push_tokens
    where token in (select jsonb_array_elements_text(coalesce(r.dead_tokens, '[]'::jsonb)));

    select o.attempts into v_attempts from public.push_outbox o
    where o.id = r.id and o.status = 'sending' for update;
    if not found then
      continue;
    end if;

    if r.status = 'sent' then
      update public.push_outbox
         set status = 'sent', sent_at = now(), claimed_at = null, last_error = left(r.error, 500)
       where id = r.id;
      insert into public.push_tickets (ticket_id, outbox_id, token)
      select t.ticket_id, r.id, t.token
      from jsonb_to_recordset(coalesce(r.tickets, '[]'::jsonb)) as t(ticket_id text, token text)
      on conflict (ticket_id) do nothing;
    elsif r.status = 'retry' and v_attempts < 4 then
      update public.push_outbox
         set status = 'queued', claimed_at = null, last_error = left(r.error, 500),
             send_after = now() + make_interval(mins => least(greatest(coalesce(r.delay_min, 1), 1), 60))
       where id = r.id;
    else
      update public.push_outbox
         set status = 'failed', claimed_at = null, last_error = left(coalesce(r.error, 'reintentos_agotados'), 500)
       where id = r.id;
    end if;
  end loop;
end $$;

-- Tickets de hace más de 15 min sin recibo revisado (máx. 1000). Cada consulta cuenta un intento:
-- tras 6 intentos, o a las 24 h (Expo ya no guarda el recibo), se dan por revisados.
create or replace function public.push_receipts_pending() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_res jsonb;
begin
  update public.push_tickets set checked_at = now()
  where checked_at is null and (created_at < now() - interval '24 hours' or receipt_tries >= 6);

  with s as (
    select t.ticket_id from public.push_tickets t
    where t.checked_at is null and t.created_at < now() - interval '15 minutes'
    order by t.created_at
    limit 1000
    for update skip locked
  ), u as (
    update public.push_tickets t set receipt_tries = t.receipt_tries + 1
      from s where t.ticket_id = s.ticket_id
    returning t.ticket_id, t.token
  )
  select coalesce(jsonb_agg(jsonb_build_object('ticket_id', u.ticket_id, 'token', u.token)), '[]'::jsonb)
    into v_res from u;
  return v_res;
end $$;

-- p_result = { checked: [ticket_id], dead_tokens: [token] }: marca revisados y borra los tokens muertos.
create or replace function public.push_receipts_done(p_result jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.push_tickets set checked_at = now()
  where ticket_id in (select jsonb_array_elements_text(coalesce(p_result -> 'checked', '[]'::jsonb)));
  delete from public.push_tokens
  where token in (select jsonb_array_elements_text(coalesce(p_result -> 'dead_tokens', '[]'::jsonb)));
end $$;

-- -----------------------------------------------------------------------------
-- 6. Tic del cron: si hay trabajo, llama a la Edge Function con pg_net
-- -----------------------------------------------------------------------------
-- La URL y el secreto compartido se leen de Vault (avisos_url, avisos_secret); nunca van en git.
-- En la fase 3 existirá private.enqueue_scheduled(timestamptz): si ya está, el tic la llama antes.
create or replace function private.avisos_tick() returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_trabajo boolean;
  v_url     text;
  v_secret  text;
begin
  if to_regprocedure('private.enqueue_scheduled(timestamptz)') is not null then
    begin
      execute 'select private.enqueue_scheduled(now())';
    exception when others then
      raise warning 'avisos_tick: enqueue_scheduled: %', sqlerrm;
    end;
  end if;

  select exists (select 1 from public.push_outbox
                 where (status = 'queued' and send_after <= now())
                    or (status = 'sending' and claimed_at < now() - interval '10 minutes'))
      or exists (select 1 from public.push_tickets
                 where checked_at is null and created_at < now() - interval '15 minutes')
    into v_trabajo;
  if not v_trabajo then
    return;
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'avisos_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'avisos_secret';
  if v_url is null or v_secret is null then
    raise warning 'avisos_tick: faltan avisos_url o avisos_secret en Vault';
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body    := '{}'::jsonb,
    -- Holgado: la función puede tardar (Expo + recibos) y no conviene cortarle la conexión a mitad de un envío.
    timeout_milliseconds := 60000
  );
exception when others then
  raise warning 'avisos_tick: %', sqlerrm;
end $$;

-- -----------------------------------------------------------------------------
-- 7. Permisos explícitos (las funciones nuevas de public heredan execute para todos: se quita)
-- -----------------------------------------------------------------------------
revoke all on function public.register_push_token(text, text)   from public, anon, authenticated;
revoke all on function public.unregister_push_token(text)       from public, anon, authenticated;
revoke all on function public.send_test_push()                  from public, anon, authenticated;
revoke all on function public.push_claim(integer)               from public, anon, authenticated;
revoke all on function public.push_finish(jsonb)                from public, anon, authenticated;
revoke all on function public.push_receipts_pending()           from public, anon, authenticated;
revoke all on function public.push_receipts_done(jsonb)         from public, anon, authenticated;
revoke all on function private.enqueue_push(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function private.avisos_tick()                    from public, anon, authenticated;

grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text)     to authenticated;
grant execute on function public.send_test_push()                to authenticated;
grant execute on function public.push_claim(integer)             to service_role;
grant execute on function public.push_finish(jsonb)              to service_role;
grant execute on function public.push_receipts_pending()         to service_role;
grant execute on function public.push_receipts_done(jsonb)       to service_role;
-- private.enqueue_push y private.avisos_tick no se conceden a nadie (las usan otras funciones definer y el cron).

-- -----------------------------------------------------------------------------
-- 8. Cron (solo si las extensiones están activadas; si no, se avisa y se puede volver a ejecutar)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Limpieza diaria: avisos de más de 30 días (sus tickets caen en cascada) y tokens sin refrescar en 120 días.
    perform cron.schedule('ito-avisos-limpieza', '45 4 * * *',
      $job$delete from public.push_outbox where created_at < now() - interval '30 days';
           delete from public.push_tokens where updated_at < now() - interval '120 days'$job$);
    if exists (select 1 from pg_extension where extname = 'pg_net') then
      perform cron.schedule('ito-avisos', '* * * * *', 'select private.avisos_tick()');
    else
      raise notice 'pg_net no está activado: no se programa ito-avisos (actívalo y vuelve a ejecutar este script)';
    end if;
  else
    raise notice 'pg_cron no está activado: no se programan ito-avisos ni ito-avisos-limpieza (actívalo y vuelve a ejecutar este script)';
  end if;
end $$;

commit;

-- =============================================================================
-- PARTE B · Pruebas (no dejan nada: todo acaba en ROLLBACK). Ejecutar en el SQL Editor como postgres.
-- Si una prueba falla, el script se detiene con «FALLO: ...» y la parte A ya está aplicada.
-- auth.uid() se simula con request.jwt.claims.
-- =============================================================================
begin;
-- Si una prueba falla y la sesión se queda con la transacción abortada, se cierra sola (y suelta los bloqueos).
set local idle_in_transaction_session_timeout = '60s';

-- Datos de prueba: dos personas en una pareja y una tercera sin pareja.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'avisos-a@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a2', 'avisos-b@prueba.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000a3', 'avisos-c@prueba.invalid', 'authenticated', 'authenticated');
insert into public.couples (id) values ('00000000-0000-4000-8000-0000000000c1');
insert into public.couple_members (couple_id, user_id, slot) values
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a1', 'm1'),
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000a2', 'm2');

-- B1. Permisos
do $$
begin
  assert not has_table_privilege('authenticated', 'public.push_tokens', 'insert'), 'FALLO: authenticated aún inserta en push_tokens';
  assert not has_table_privilege('authenticated', 'public.push_tokens', 'update'), 'FALLO: authenticated aún actualiza push_tokens';
  assert has_table_privilege('authenticated', 'public.push_tokens', 'select'), 'FALLO: authenticated debe poder leer sus tokens';
  assert has_table_privilege('authenticated', 'public.push_tokens', 'delete'), 'FALLO: authenticated debe poder borrar sus tokens';
  assert not has_table_privilege('authenticated', 'public.push_outbox', 'select'), 'FALLO: authenticated lee push_outbox';
  assert not has_table_privilege('authenticated', 'public.push_tickets', 'select'), 'FALLO: authenticated lee push_tickets';
  assert not has_table_privilege('anon', 'public.push_outbox', 'select'), 'FALLO: anon lee push_outbox';
  assert not has_function_privilege('authenticated', 'public.push_claim(integer)', 'execute'), 'FALLO: authenticated ejecuta push_claim';
  assert not has_function_privilege('authenticated', 'public.push_finish(jsonb)', 'execute'), 'FALLO: authenticated ejecuta push_finish';
  assert not has_function_privilege('authenticated', 'public.push_receipts_pending()', 'execute'), 'FALLO: authenticated ejecuta push_receipts_pending';
  assert not has_function_privilege('authenticated', 'public.push_receipts_done(jsonb)', 'execute'), 'FALLO: authenticated ejecuta push_receipts_done';
  assert not has_function_privilege('anon', 'public.push_claim(integer)', 'execute'), 'FALLO: anon ejecuta push_claim';
  assert not has_function_privilege('anon', 'public.register_push_token(text, text)', 'execute'), 'FALLO: anon ejecuta register_push_token';
  assert has_function_privilege('service_role', 'public.push_claim(integer)', 'execute'), 'FALLO: service_role no ejecuta push_claim';
  assert has_function_privilege('service_role', 'public.push_finish(jsonb)', 'execute'), 'FALLO: service_role no ejecuta push_finish';
  assert has_function_privilege('authenticated', 'public.register_push_token(text, text)', 'execute'), 'FALLO: authenticated no ejecuta register_push_token';
  assert has_function_privilege('authenticated', 'public.send_test_push()', 'execute'), 'FALLO: authenticated no ejecuta send_test_push';
  assert not has_function_privilege('authenticated', 'private.enqueue_push(uuid, uuid, text, text, text, text, text, text)', 'execute'), 'FALLO: authenticated ejecuta enqueue_push';
  assert not has_function_privilege('authenticated', 'private.avisos_tick()', 'execute'), 'FALLO: authenticated ejecuta avisos_tick';
  assert (select relrowsecurity from pg_class where oid = 'public.push_outbox'::regclass), 'FALLO: push_outbox sin RLS';
  assert (select relrowsecurity from pg_class where oid = 'public.push_tickets'::regclass), 'FALLO: push_tickets sin RLS';
  assert not exists (select 1 from pg_policies where tablename in ('push_outbox', 'push_tickets')), 'FALLO: push_outbox/push_tickets no deben tener políticas';
  assert (select count(*) from information_schema.columns
          where table_name = 'couple_members' and column_name in ('notify_events', 'notify_requests')) = 2, 'FALLO: faltan notify_events/notify_requests';
end $$;

-- B2. register_push_token: alta, formato, reasignación y límite de 10
do $$
declare
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_b constant uuid := '00000000-0000-4000-8000-0000000000a2';
  v_ok boolean;
  i integer;
begin
  -- sin sesión
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'ios');
    raise exception 'FALLO: register_push_token sin sesión debía fallar';
  exception when sqlstate '28000' then null;
  end;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  perform public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'ios');
  assert (select user_id from public.push_tokens where token = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]') = v_a, 'FALLO: token no registrado a A';

  -- formato y plataforma inválidos
  v_ok := false;
  begin perform public.register_push_token('token-cualquiera', 'ios'); exception when sqlstate '22023' then v_ok := true; end;
  assert v_ok, 'FALLO: formato de token inválido aceptado';
  v_ok := false;
  begin perform public.register_push_token('ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]', 'web'); exception when sqlstate '22023' then v_ok := true; end;
  assert v_ok, 'FALLO: plataforma inválida aceptada';

  -- reasignación: el mismo token, otra cuenta
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
  perform public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'android');
  assert (select user_id from public.push_tokens where token = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]') = v_b, 'FALLO: token no reasignado a B';
  assert (select count(*) from public.push_tokens where token = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]') = 1, 'FALLO: token duplicado';

  -- unregister: A no puede borrar el token de B
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  perform public.unregister_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]');
  assert exists (select 1 from public.push_tokens where token = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'), 'FALLO: A borró un token de B';
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);
  perform public.unregister_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]');
  assert not exists (select 1 from public.push_tokens where token = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]'), 'FALLO: B no pudo borrar su token';

  -- límite de 10 por usuario
  for i in 1..12 loop
    perform public.register_push_token('ExponentPushToken[limite' || lpad(i::text, 10, '0') || ']', 'ios');
  end loop;
  assert (select count(*) from public.push_tokens where user_id = v_b) = 10, 'FALLO: B debe tener 10 tokens como máximo';
  delete from public.push_tokens where user_id = v_b;
end $$;

-- B3. enqueue_push: miembro, preferencia y duplicados
do $$
declare
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_b constant uuid := '00000000-0000-4000-8000-0000000000a2';
  v_c constant uuid := '00000000-0000-4000-8000-0000000000a3';
  v_p constant uuid := '00000000-0000-4000-8000-0000000000c1';
begin
  assert private.enqueue_push(v_b, v_p, 'deletion_request', 'prueba:1', 'T', 'B', '/', 'notify_requests'), 'FALLO: no encola a un miembro con la preferencia activa';
  assert not private.enqueue_push(v_b, v_p, 'deletion_request', 'prueba:1', 'T', 'B', '/', 'notify_requests'), 'FALLO: dedupe_key repetida debe devolver false';
  assert (select count(*) from public.push_outbox where dedupe_key = 'prueba:1') = 1, 'FALLO: aviso duplicado';

  update public.couple_members set notify_requests = false where user_id = v_b;
  assert not private.enqueue_push(v_b, v_p, 'deletion_request', 'prueba:2', 'T', 'B', '/', 'notify_requests'), 'FALLO: encola con la preferencia desactivada';
  assert not exists (select 1 from public.push_outbox where dedupe_key = 'prueba:2'), 'FALLO: fila con preferencia desactivada';
  assert private.enqueue_push(v_b, v_p, 'settlement', 'prueba:3', 'T', 'B', '/', 'notify_settlements'), 'FALLO: otra preferencia debe seguir activa';

  assert not private.enqueue_push(v_c, v_p, 'test', 'prueba:4', 'T', 'C', '/', null), 'FALLO: encola a quien no es miembro';
  update public.couple_members set left_at = now() where user_id = v_b;
  assert not private.enqueue_push(v_b, v_p, 'test', 'prueba:5', 'T', 'B', '/', null), 'FALLO: encola a un miembro que se fue';
  update public.couple_members set left_at = null where user_id = v_b;

  begin
    perform private.enqueue_push(v_a, v_p, 'test', 'prueba:6', 'T', 'A', '/', 'slot; drop table x');
    raise exception 'FALLO: preferencia desconocida aceptada';
  exception when sqlstate '22023' then null;
  end;
  delete from public.push_outbox where dedupe_key like 'prueba:%';
end $$;

-- B4. send_test_push, push_claim y push_finish (envío, reintentos y token muerto)
do $$
declare
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_c constant uuid := '00000000-0000-4000-8000-0000000000a3';
  v_id uuid;
  v_res jsonb;
begin
  -- Los avisos reales que hubiera en la cola quedan fuera de las pruebas (se deshace en el ROLLBACK).
  update public.push_outbox set send_after = 'infinity' where status in ('queued', 'sending');

  -- C no tiene pareja
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}', true);
  begin
    perform public.send_test_push();
    raise exception 'FALLO: send_test_push sin pareja debía fallar';
  exception when sqlstate 'TW001' then null;
  end;

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  insert into public.push_tokens (token, user_id, platform) values
    ('ExponentPushToken[ccccccccccccccccccccc1]', v_a, 'ios'),
    ('ExponentPushToken[ccccccccccccccccccccc2]', v_a, 'android');
  assert public.send_test_push(), 'FALLO: send_test_push no encola';
  assert not public.send_test_push(), 'FALLO: send_test_push debe limitarse a uno por minuto';
  assert (select count(*) from public.push_outbox where user_id = v_a and kind = 'test') = 1, 'FALLO: debe haber un aviso de prueba';

  -- claim: devuelve el aviso con sus 2 tokens y lo marca 'sending'
  v_res := public.push_claim(200);
  assert jsonb_array_length(v_res) = 1, 'FALLO: push_claim debía devolver 1 aviso';
  assert jsonb_array_length(v_res -> 0 -> 'tokens') = 2, 'FALLO: el aviso debía llevar 2 tokens';
  assert (v_res -> 0 ->> 'attempts')::int = 1, 'FALLO: attempts debía ser 1';
  v_id := (v_res -> 0 ->> 'id')::uuid;
  assert (select status from public.push_outbox where id = v_id) = 'sending', 'FALLO: el aviso debía quedar sending';
  assert jsonb_array_length(public.push_claim(200)) = 0, 'FALLO: un segundo claim no debe devolver lo ya reservado';

  -- reintento: vuelve a la cola con espera
  perform public.push_finish(jsonb_build_array(jsonb_build_object('id', v_id, 'status', 'retry', 'error', 'http_503', 'delay_min', 1)));
  assert (select status from public.push_outbox where id = v_id) = 'queued', 'FALLO: el reintento debía volver a queued';
  assert (select send_after from public.push_outbox where id = v_id) > now(), 'FALLO: el reintento debe esperar';
  assert jsonb_array_length(public.push_claim(200)) = 0, 'FALLO: un reintento con espera no debe reservarse todavía';

  -- recuperado: ya listo, se reserva (attempts 2); un token muerto se borra y el otro deja ticket
  update public.push_outbox set send_after = now() where id = v_id;
  v_res := public.push_claim(200);
  assert jsonb_array_length(v_res) = 1 and (v_res -> 0 ->> 'attempts')::int = 2, 'FALLO: el reintento debía reservarse con attempts = 2';
  perform public.push_finish(jsonb_build_array(jsonb_build_object(
    'id', v_id, 'status', 'sent', 'error', null,
    'tickets', jsonb_build_array(jsonb_build_object('ticket_id', 'ticket-prueba-1', 'token', 'ExponentPushToken[ccccccccccccccccccccc1]')),
    'dead_tokens', jsonb_build_array('ExponentPushToken[ccccccccccccccccccccc2]'))));
  assert (select status from public.push_outbox where id = v_id) = 'sent', 'FALLO: el aviso debía quedar sent';
  assert not exists (select 1 from public.push_tokens where token = 'ExponentPushToken[ccccccccccccccccccccc2]'), 'FALLO: token muerto sin borrar';
  assert exists (select 1 from public.push_tokens where token = 'ExponentPushToken[ccccccccccccccccccccc1]'), 'FALLO: se borró un token vivo';
  assert (select count(*) from public.push_tickets where outbox_id = v_id) = 1, 'FALLO: debía haber 1 ticket';

  -- push_finish solo toca filas en 'sending': repetir no cambia nada
  perform public.push_finish(jsonb_build_array(jsonb_build_object('id', v_id, 'status', 'failed', 'error', 'x')));
  assert (select status from public.push_outbox where id = v_id) = 'sent', 'FALLO: push_finish cambió una fila que no estaba sending';

  -- a los 4 intentos, un 'retry' pasa a failed
  insert into public.push_outbox (user_id, couple_id, kind, dedupe_key, title, body, status, attempts, claimed_at)
  values (v_a, '00000000-0000-4000-8000-0000000000c1', 'test', 'prueba:agotado', 'T', 'B', 'sending', 4, now());
  select id into v_id from public.push_outbox where dedupe_key = 'prueba:agotado';
  perform public.push_finish(jsonb_build_array(jsonb_build_object('id', v_id, 'status', 'retry', 'error', 'http_503', 'delay_min', 15)));
  assert (select status from public.push_outbox where id = v_id) = 'failed', 'FALLO: a los 4 intentos debía quedar failed';

  -- atascado en sending más de 10 min: con 4 intentos pasa a failed; con menos, vuelve a la cola
  insert into public.push_outbox (user_id, couple_id, kind, dedupe_key, title, body, status, attempts, claimed_at)
  values (v_a, '00000000-0000-4000-8000-0000000000c1', 'test', 'prueba:atascado', 'T', 'B', 'sending', 1, now() - interval '11 minutes');
  v_res := public.push_claim(200);
  assert jsonb_array_length(v_res) = 1 and (v_res -> 0 ->> 'attempts')::int = 2, 'FALLO: el aviso atascado debía recuperarse y reservarse (attempts = 2)';

  -- un usuario sin tokens: el aviso se devuelve con tokens vacíos
  insert into public.push_outbox (user_id, couple_id, kind, dedupe_key, title, body)
  values ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000c1', 'test', 'prueba:sintokens', 'T', 'B');
  v_res := public.push_claim(200);
  assert jsonb_array_length(v_res) = 1 and jsonb_array_length(v_res -> 0 -> 'tokens') = 0, 'FALLO: sin tokens debía devolver tokens = []';
end $$;

-- B5. Recibos: pendientes, intentos y borrado de token muerto
do $$
declare
  v_a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  v_id uuid;
  v_res jsonb;
  i integer;
begin
  -- Los tickets reales pendientes quedan fuera de las pruebas (se deshace en el ROLLBACK).
  update public.push_tickets set checked_at = now() where checked_at is null;

  insert into public.push_tokens (token, user_id, platform)
  values ('ExponentPushToken[ddddddddddddddddddddd1]', v_a, 'ios');
  insert into public.push_outbox (user_id, couple_id, kind, dedupe_key, title, body, status)
  values (v_a, '00000000-0000-4000-8000-0000000000c1', 'test', 'prueba:recibos', 'T', 'B', 'sent')
  returning id into v_id;
  insert into public.push_tickets (ticket_id, outbox_id, token, created_at) values
    ('t-reciente', v_id, 'ExponentPushToken[ddddddddddddddddddddd1]', now() - interval '5 minutes'),
    ('t-muerto',   v_id, 'ExponentPushToken[ddddddddddddddddddddd1]', now() - interval '20 minutes'),
    ('t-antiguo',  v_id, 'ExponentPushToken[ddddddddddddddddddddd1]', now() - interval '25 hours');

  v_res := public.push_receipts_pending();
  assert jsonb_array_length(v_res) = 1 and v_res -> 0 ->> 'ticket_id' = 't-muerto', 'FALLO: solo t-muerto debía estar pendiente';
  assert (select checked_at is not null from public.push_tickets where ticket_id = 't-antiguo'), 'FALLO: el ticket de más de 24 h debía darse por revisado';
  assert (select checked_at is null from public.push_tickets where ticket_id = 't-reciente'), 'FALLO: el ticket reciente no debe revisarse aún';

  perform public.push_receipts_done(jsonb_build_object('checked', jsonb_build_array('t-muerto'),
                                                       'dead_tokens', jsonb_build_array('ExponentPushToken[ddddddddddddddddddddd1]')));
  assert (select checked_at is not null from public.push_tickets where ticket_id = 't-muerto'), 'FALLO: t-muerto debía quedar revisado';
  assert not exists (select 1 from public.push_tokens where token = 'ExponentPushToken[ddddddddddddddddddddd1]'), 'FALLO: token muerto sin borrar por recibo';
  assert jsonb_array_length(public.push_receipts_pending()) = 0, 'FALLO: ya no debía haber recibos pendientes';

  -- sin recibo disponible: tras 6 consultas se da por revisado
  insert into public.push_tickets (ticket_id, outbox_id, token, created_at)
  values ('t-sin-recibo', v_id, 'ExponentPushToken[eeeeeeeeeeeeeeeeeeeee1]', now() - interval '20 minutes');
  for i in 1..6 loop
    assert jsonb_array_length(public.push_receipts_pending()) = 1, 'FALLO: t-sin-recibo debía seguir pendiente';
  end loop;
  assert jsonb_array_length(public.push_receipts_pending()) = 0, 'FALLO: t-sin-recibo debía darse por revisado tras 6 intentos';
end $$;

-- B6. Tic: sin trabajo no hace nada y sin secretos no rompe
do $$
begin
  delete from public.push_outbox where user_id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2');
  perform private.avisos_tick();   -- sin trabajo: sale sin leer Vault ni llamar a pg_net
  insert into public.push_outbox (user_id, couple_id, kind, dedupe_key, title, body)
  values ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000c1', 'test', 'prueba:tick', 'T', 'B');
  perform private.avisos_tick();   -- con trabajo: llama a pg_net si hay secretos; si no, solo un WARNING
end $$;

-- B7. Cron programado (informativo: sale NOTICE si no hay pg_cron / pg_net)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'Trabajos cron de avisos: %', (select string_agg(jobname || ' [' || schedule || ']', ', ') from cron.job where jobname like 'ito-avisos%');
  end if;
  raise notice 'PRUEBAS DE AVISOS (fase 1): todas correctas';
end $$;

rollback;
