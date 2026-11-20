# enviar-avisos (avisos push, fase 1)

Edge Function que manda a Expo los avisos de la cola `push_outbox`. La llama pg_cron (vía pg_net) cada minuto
**solo si hay trabajo**. Detalle en `docs/plan-avisos-push.md`.

## Pasos manuales de David (Supabase)

1. Database → Extensions: activar `pg_net` (y comprobar que `pg_cron` está activo).
2. Generar un secreto largo (p. ej. `openssl rand -hex 32`) y en el SQL Editor:
   `select vault.create_secret('https://<ref>.supabase.co/functions/v1/enviar-avisos', 'avisos_url');`
   `select vault.create_secret('<secreto>', 'avisos_secret');`
3. Edge Functions → Secrets: `AVISOS_SECRET` (el mismo secreto) y `EXPO_ACCESS_TOKEN`
   (se crea en expo.dev → Access tokens; hasta la fase 2 puede quedar sin definir, la función lo omite).
4. Desplegar `enviar-avisos` como `borrar-cuenta`, **con «Verify JWT» desactivado**
   (`supabase functions deploy enviar-avisos --no-verify-jwt`, o desde el panel).
5. Aplicar `supabase/migrations/20261123000000_avisos_base.sql` en el SQL Editor (si activaste `pg_net` después,
   vuelve a ejecutarla para que se programe el cron). Termina con pruebas que acaban en `rollback`:
   el mensaje final debe decir «PRUEBAS DE AVISOS (fase 1): todas correctas».

## Probar el camino entero sin móvil

En el SQL Editor (simulando tu usuario):

```sql
select set_config('request.jwt.claims', '{"sub":"<tu uid>","role":"authenticated"}', true);
select public.register_push_token('ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]', 'ios');
select public.send_test_push();
```

En 1–2 minutos: `select status, last_error from public.push_outbox order by created_at desc limit 3;` debe mostrar
`sent` (con el token falso, Expo lo rechaza: el token se borra por `DeviceNotRegistered`).
Si queda en `queued`, mira los logs de la función y `select * from net._http_response order by created desc limit 5;`.
