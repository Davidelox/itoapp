-- =============================================================================
-- ito · Endurecimiento para el primer uso (onboarding)
-- 2026-11-14 · Ver docs/plan-onboarding.md §5.2 y §5.3.
-- NO aplicada: la ejecuta David en el SQL Editor tras la revisión del arquitecto.
-- Se puede ejecutar más de una vez (cada paso comprueba si ya está hecho).
--
-- Parte A: límites de Storage, avatar_path acotado, profiles en tiempo real,
--          privilegios por defecto y limpieza de intentos de unión.
-- Parte B: quien sale del espacio solo puede volver a su propio hueco; una persona
--          distinta no puede ocuparlo; el hueco de quien salió ya no bloquea los códigos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Parte A.1 · Storage: tamaño y tipos permitidos
-- -----------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 2 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

update storage.buckets
set file_size_limit = 10 * 1024 * 1024,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
where id = 'receipts';

-- -----------------------------------------------------------------------------
-- Parte A.3 · avatar_path solo puede apuntar a la carpeta del propio usuario
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_path_own_folder') then
    alter table public.profiles
      add constraint profiles_avatar_path_own_folder
      check (avatar_path is null or avatar_path ~ ('^' || id::text || '/[A-Za-z0-9._-]+$'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Parte A.4 · profiles en tiempo real (la RLS filtra qué recibe cada suscriptor)
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Parte A.5 · Privilegios por defecto: lo que se cree desde ahora en public no es para anon
--   (se aplica a los objetos que cree el rol que ejecuta este script, normalmente postgres)
-- -----------------------------------------------------------------------------
--   Nota: el EXECUTE de PUBLIC sobre funciones es un privilegio por defecto GLOBAL y no se puede quitar
--   con «in schema» (Postgres lo ignora). No se quita globalmente porque afectaría también a extensiones
--   futuras (p. ej. PostGIS). Por eso cada migración debe seguir haciendo «revoke ... from public, anon»
--   en sus funciones nuevas, como hace el final de este archivo.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- -----------------------------------------------------------------------------
-- Parte A.6 · Limpieza diaria de intentos de unión (más de 1 día)
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('ito-limpieza', '30 4 * * *',
      $job$delete from private.join_attempts where attempted_at < now() - interval '1 day'$job$);
  else
    raise notice 'pg_cron no está activado: no se programa ito-limpieza (actívalo y vuelve a ejecutar este script)';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Parte B · Volver a tu hueco si sales
--   create_invitation: solo exige que haya menos de dos miembros ACTIVOS.
--   join_couple: si ya fuiste miembro de esa pareja, se reactiva tu fila (mismo hueco, mismo color).
--                Una persona distinta solo entra si el hueco m2 no lo ha tenido nunca nadie;
--                si lo ocupó otra persona que ya salió, responde couple_full.
-- -----------------------------------------------------------------------------
create or replace function public.create_invitation() returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_couple uuid := private.my_couple_id();
  v_code   text;
begin
  if v_couple is null then
    raise exception 'No perteneces a ninguna pareja' using errcode = 'TW001';
  end if;
  if private.active_member_count(v_couple) >= 2 then
    raise exception 'La pareja ya está completa' using errcode = 'TW003';
  end if;
  update public.couple_invitations set revoked_at = now()
  where couple_id = v_couple and used_at is null and revoked_at is null;
  loop
    v_code := private.generate_invite_code();
    begin
      insert into public.couple_invitations (couple_id, code, created_by) values (v_couple, v_code, auth.uid());
      exit;
    exception when unique_violation then
      -- colisión de código: probar otro
    end;
  end loop;
  return v_code;
end $$;

create or replace function public.join_couple(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_code text;
  v_inv  public.couple_invitations;
  v_back boolean;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = 'TW001';
  end if;
  if private.my_couple_id() is not null then
    return jsonb_build_object('ok', false, 'error', 'already_in_couple');
  end if;
  if (select count(*) from private.join_attempts a
       where a.user_id = v_uid and a.attempted_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;
  insert into private.join_attempts (user_id) values (v_uid);

  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));

  select * into v_inv from public.couple_invitations i where i.code = v_code for update;
  if not found or v_inv.revoked_at is not null then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  elsif v_inv.used_at is not null then
    return jsonb_build_object('ok', false, 'error', 'code_used');
  elsif v_inv.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'code_expired');
  end if;

  perform 1 from public.couples c where c.id = v_inv.couple_id for update;  -- serializa uniones

  if private.active_member_count(v_inv.couple_id) >= 2 then
    return jsonb_build_object('ok', false, 'error', 'couple_full');
  end if;

  select exists (select 1 from public.couple_members m
                 where m.couple_id = v_inv.couple_id and m.user_id = v_uid) into v_back;

  if v_back then
    -- Vuelve a su hueco (conserva slot, color y fecha de alta).
    update public.couple_members set left_at = null
    where couple_id = v_inv.couple_id and user_id = v_uid;
  else
    -- Persona nueva: solo si el hueco m2 no lo ha tenido nunca nadie. Además de la fila de m2 se mira si
    -- alguna invitación se llegó a usar: si quien fue m2 borra su cuenta, su fila desaparece en cascada,
    -- pero used_at se conserva (used_by pasa a null) y sigue cerrando el hueco a desconocidos.
    if exists (select 1 from public.couple_members m where m.couple_id = v_inv.couple_id and m.slot = 'm2')
       or exists (select 1 from public.couple_invitations i
                  where i.couple_id = v_inv.couple_id and i.used_at is not null) then
      return jsonb_build_object('ok', false, 'error', 'couple_full');
    end if;
    insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
    insert into public.couple_members (couple_id, user_id, slot) values (v_inv.couple_id, v_uid, 'm2');
  end if;

  update public.couple_invitations set used_by = v_uid, used_at = now() where id = v_inv.id;
  return jsonb_build_object('ok', true, 'couple_id', v_inv.couple_id);
end $$;

-- create or replace conserva los permisos existentes; se reafirman por claridad.
revoke all on function public.create_invitation() from public, anon;
revoke all on function public.join_couple(text) from public, anon;
grant execute on function public.create_invitation() to authenticated;
grant execute on function public.join_couple(text) to authenticated;
