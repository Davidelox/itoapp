# Plan · Avisos push

> **Dentro**: registro de dispositivos, permisos, sección «Avisos» en Ajustes, avisos programados (eventos y
> cumpleaños, cobros de recurrentes, importes variables pendientes, «¿Quién pagó?») y avisos por acciones de la
> pareja (pedir borrar, propuestas de ajustes, liquidaciones, gastos de la pareja). Envío desde el servidor.
> **Fuera**: insignia con número en el icono, avisos agrupados por día, horas de silencio configurables, avisos
> de planes y del mapa (llegan con sus pestañas), notificaciones en web.

## 1. Decisión

**Todo sale del servidor**: pg_cron cada minuto → función SQL que decide qué avisar, a quién y cuándo, y lo
deja en una cola (`push_outbox`) → si hay algo listo, `pg_net` llama a la Edge Function `enviar-avisos`, que lo
manda al servicio push de Expo, guarda los tickets, lee los recibos y borra los tokens muertos.

- Una sola fuente de verdad: la misma regla de ajustes, privacidad y secretos para los dos móviles, y un cambio
  de la pareja (mover un evento, pausar un pago) se respeta sin abrir la app.
- La decisión (qué y a quién) va en SQL con `security definer`, al lado de la RLS que hay que imitar; la Edge
  Function solo transporta. `service_role` solo existe en la Edge Function.
- Alternativa seria: notificaciones **locales** programadas en el móvil (funcionan en Expo Go). No cubren las
  acciones de la pareja, se quedan viejas si el otro edita, y iOS limita a 64 pendientes. Descartada.

## 2. Expo Go vs build de desarrollo

Con SDK 58, **Expo Go no recibe push remotos** (ni iOS ni Android, desde SDK 53). Sí permite permisos y
notificaciones locales.

| Se puede probar en Expo Go | Exige build de desarrollo (EAS) |
|---|---|
| Sección «Avisos» de Ajustes y guardado de `notify_*` | Obtener el token Expo (`getExpoPushTokenAsync`) |
| Diálogo de permiso del sistema y estado «denegado → abrir Ajustes del iPhone» | Recibir un push real (y «Probar aviso») |
| Al tocar un aviso, navegar a su pantalla (con un aviso **local** desde `app/laboratorio`) | Recibir avisos con la app cerrada |
| Todo el servidor: cola, reglas y Edge Function (en el SQL Editor y con un token falso) | Prueba con las dos cuentas en dos móviles |

El código de registro no hace nada en Expo Go (`Constants.executionEnvironment === ExecutionEnvironment.StoreClient`)
ni en simulador (`!Device.isDevice`): ni errores ni avisos en consola.

Tras instalar la build de desarrollo se sigue trabajando igual: `npx expo start --dev-client` carga el JS
desde Metro. Solo hay que volver a compilar si se añade otra dependencia nativa.

## 3. Modelo de datos

### 3.1 `push_tokens` (ya existe)

`token` PK, `user_id`, `platform`, `updated_at`. Política `push_tokens_own` (`for all`, solo los propios).

- **Problema**: si en un móvil se cierra sesión y entra otra cuenta, el `upsert` de la nueva choca con la PK y
  la RLS le oculta la fila: falla, y los avisos de la cuenta anterior siguen llegando a ese móvil.
- **Solución**: el cliente no escribe la tabla. RPC `public.register_push_token(p_token text, p_platform text)`
  `security definer`: valida formato (`^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,100}\]$`) y plataforma,
  `insert … on conflict (token) do update set user_id = auth.uid(), platform, updated_at = now()`, y deja como
  mucho 10 tokens por usuario (borra los más antiguos). RPC `public.unregister_push_token(p_token text)`: borra
  solo si es suyo. Se revoca `insert, update` de `authenticated`; se quedan `select` y `delete` propios.
- `leave_couple` ya borra los tokens; el borrado de cuenta, en cascada.

### 3.2 Preferencias (`couple_members`, cada uno edita su fila)

Existen `notify_payment_reminder`, `notify_who_paid`, `notify_partner_expense`, `notify_settlements`. Se añaden
`notify_events` y `notify_requests` (`boolean not null default true`).

| Interruptor en Ajustes | Columna | Avisos |
|---|---|---|
| Cobros y pagos | `notify_payment_reminder` | Recordatorio de cobro, importe variable pendiente |
| Eventos y cumpleaños | `notify_events` | Recordatorio de evento y de cumpleaños |
| ¿Quién pagó? | `notify_who_paid` | Al terminar un evento con «¿Quién pagó?» |
| Gastos de tu pareja | `notify_partner_expense` | Tu pareja añade un gasto compartido |
| Liquidaciones | `notify_settlements` | Te piden confirmar un pago; confirman o rechazan el tuyo |
| Peticiones de tu pareja | `notify_requests` | Pedir borrar algo, propuesta de cambio de ajustes |

Además: `events.reminder_minutes` pasa a `check (reminder_minutes between 0 and 10080)` (la app usa como mucho
9540); así la ventana de cálculo está acotada.

### 3.3 Cola y tickets (nuevas, en `public`, sin acceso del cliente)

En `public` para que la Edge Function las use con `service_role` vía PostgREST. RLS activada **sin políticas** y
`revoke all … from anon, authenticated` (las tablas nuevas de `public` heredan permisos de Supabase).

```
push_outbox
  id uuid pk, user_id uuid (fk profiles on delete cascade), couple_id uuid,
  kind text,                -- event | birthday | payment_due | variable_amount | who_paid | deletion_request
                            -- | settings_proposal | settlement | partner_expense | test
  dedupe_key text unique,   -- ver §4; evita duplicados aunque el cron se solape o se repita
  title text, body text, url text,     -- url = ruta interna para abrir al tocar
  send_after timestamptz, status text check in ('queued','sending','sent','failed'),
  attempts smallint default 0, last_error text, created_at, sent_at
  index (status, send_after)

push_tickets
  ticket_id text pk, outbox_id uuid (fk on delete cascade), token text, created_at, checked_at
```

### 3.4 Funciones

| Función | Seguridad | Qué hace |
|---|---|---|
| `private.enqueue_scheduled(p_now timestamptz default now())` | definer, sin grant | Avisos programados (§4.1) que vencen en la ventana |
| `private.enqueue_push(p_user, p_couple, p_kind, p_key, p_title, p_body, p_url, p_pref text)` | definer, sin grant | Inserta si el usuario es miembro activo y tiene la preferencia `p_pref` activada; `on conflict (dedupe_key) do nothing` |
| `private.avisos_tick()` | definer, sin grant | La llama el cron: `enqueue_scheduled()`; si hay filas `queued` listas o tickets sin recibo de hace > 15 min, `net.http_post` a la Edge Function con el secreto de Vault |
| `public.push_claim(p_limit int default 200)` | definer, solo `service_role` | Devuelve a `queued` las `sending` de hace > 10 min; marca `sending` (+1 intento) las listas con `for update skip locked`; devuelve cada fila con los tokens de su usuario |
| `public.push_finish(p_result jsonb)` | definer, solo `service_role` | Por fila: `sent` + tickets, o reintento (`queued`, `send_after = now() + 1/5/15 min`; a los 4 intentos `failed`); borra los tokens `DeviceNotRegistered` |
| `public.push_receipts_pending()` / `public.push_receipts_done(jsonb)` | definer, solo `service_role` | Tickets de hace > 15 min sin revisar (máx. 1000) / marca revisados y borra tokens muertos |
| `public.send_test_push()` | definer, `authenticated` | «Probar aviso»: a uno mismo, clave `test:<uid>:<minuto>` (uno por minuto) |
| `private.format_money(cents, currency)` | invoker | «12,99 €» para los textos |
| `private.planned_payment_dates(r recurring_payments, p_today, p_from, p_to)` | invoker | La regla de «pagos previstos» que hoy está dentro de `calendar_range`; `calendar_range` pasa a usarla (una sola regla) |

## 4. Qué se avisa, a quién y cuándo

Hora local = `events.time_zone` en eventos y `couples.time_zone` en lo demás. Solo miembros activos
(`left_at is null`) y con su `notify_*` activado. Tokens de todos sus dispositivos.

### 4.1 Programados (`enqueue_scheduled`, cada minuto)

Regla común: se encola si el instante del aviso cae en `(p_now − 30 min, p_now]` **y** es posterior a la última
edición del elemento (`updated_at`). Así un evento creado a las 20:00 para las 20:30 con «1 hora antes» no avisa
de golpe, y si el cron estuvo caído hasta 30 min, se recupera. Más tarde, se pierde (mejor que avisar tarde).

1. **Eventos** (`reminder_minutes is not null`, sin `event_exceptions` de esa fecha). Fechas con
   `private.occurrence_dates(start_date, recurrence, recurrence_until, hoy_local − 1, hoy_local + 8)`.
   - Instante: todo el día → hora de pared: `((d + time '00:00') − reminder_minutes) at time zone tz` (las 9:00
     siguen siendo las 9:00 con cambio de hora). Con hora → `((d + start_time) at time zone tz) − reminder_minutes`.
   - Destinatarios: **secreto → solo `created_by`**; si no, `attendees` (`both` = los dos; `m1`/`m2` = ese hueco).
   - Clave: `event:<id>:<d>:<instante>` (si se mueve el evento, hay aviso nuevo).
   - Texto: «Cena en Taberna El Olivo» · «Hoy a las 20:30» / «Mañana» / «En una semana». URL `/calendario/evento/<id>?fecha=<d>`.
2. **Cumpleaños** (`category = 'birthday'`): igual que eventos (el 29 feb ya lo resuelve `occurrence_dates`),
   pero a **los dos** (aquí `attendees` es «de parte de quién»). Texto: «Mañana es el cumpleaños de Carmen · cumple 60» (con `birth_year`).
3. **Cobro próximo** (`reminder_days is not null`, no `paused`). Fechas = `planned_payment_dates(…)` **más** los
   `recurring_occurrences` de esa fecha no saltados (el job de las 04:15 UTC ya ha creado el de hoy, y la regla
   de previstos lo excluye: sin esto, «el mismo día» nunca avisaría). Instante: `due − reminder_days` a las 9:00.
   - Destinatarios: privado (`not visible_to_partner`) → `created_by`; compartido → los dos.
   - Clave `payment_due:<recurring_id>:<due>`. Texto: «Mañana se cobra Netflix · 12,99 €» («≈ 60 €» si es variable).
4. **Importe variable pendiente** (`recurring_occurrences.status = 'pending'`, recurrente no en pausa): una vez,
   a las 9:00 del día siguiente al cobro si sigue pendiente. Destinatarios: los que lo ven (privado → `created_by`).
   Clave `variable:<occurrence_id>`. Texto: «Falta el importe de Luz». URL a Inicio (pendientes).
5. **¿Quién pagó?** (`ask_who_paid`, sin resolver, igual que `pending_actions`): instante `ends_at + 15 min`; si
   cae entre las 22:00 y las 9:00 locales, a las 9:00. Destinatarios: `attendees`; **secreto → solo `created_by`**.
   Clave `who_paid:<event_id>`.

### 4.2 Acciones de la pareja (triggers `after insert/update`, al momento)

Llaman a `enqueue_push` dentro de `begin … exception when others then raise warning` (un fallo de avisos nunca
rompe la operación). Solo si `auth.uid() is not null` (lo que crea el job diario no avisa). Destinatario: el otro
miembro activo. Nombre = `profiles.display_name` de quien actúa. Llegan en el siguiente tic (≤ 1 min).

| Tabla · momento | Preferencia | Texto | Clave |
|---|---|---|---|
| `deletion_requests` insert `pending` | `notify_requests` | «Meri quiere borrar «Cena en…»» (`target_label`) | `deletion:<id>` |
| `settings_proposals` insert `pending` | `notify_requests` | «Meri propone cambiar los ajustes» | `proposal:<id>` |
| `settlements` insert `pending` → `to_slot` | `notify_settlements` | «Meri dice que te ha pagado 40 €. ¿Lo confirmas?» | `settlement:<id>` |
| `settlements` update a `confirmed`/`rejected` → `created_by` | `notify_settlements` | «Meri ha confirmado tu pago de 40 €» | `settlement:<id>:<status>` |
| `expenses` insert `visible_to_partner`, compartido, `created_by <> destinatario` | `notify_partner_expense` | «Meri ha añadido Súper · 54,20 €» | `expense:<id>` |

Secretos: los eventos secretos no pasan por `deletion_requests`; un gasto compartido de un evento secreto solo
lleva su concepto (ya se avisa al compartirlo). Ningún texto incluye el título de un evento que el destinatario
no puede ver por RLS: es la prueba obligatoria de §7.

## 5. Envío (Edge Function `enviar-avisos`)

- **Entrada**: solo `POST` con `Authorization: Bearer <AVISOS_SECRET>` (comparación en tiempo constante).
  Desplegada **sin verificación JWT** (no la llama un usuario). Usa `SUPABASE_SERVICE_ROLE_KEY` del entorno.
- **Un tic**: `push_claim(200)` → un mensaje por token
  `{ to, title, body, sound: 'default', data: { url }, channelId: 'default', priority: 'high' }` → lotes de 100 a
  `https://exp.host/--/api/v2/push/send` con `Authorization: Bearer EXPO_ACCESS_TOKEN` («Enhanced security» activado
  en Expo: sin él, cualquiera con un token podría mandar avisos).
  - Respuesta HTTP 429/5xx o timeout → la fila vuelve a la cola con espera (1, 5, 15 min; a los 4 intentos, `failed`).
  - Ticket `ok` → `push_tickets`. Ticket `DeviceNotRegistered` → borrar el token. Otro error de ticket
    (`InvalidCredentials`, `MessageTooBig`) → `last_error`, sin reintento (es de configuración).
  - Fila sin tokens → `sent` con `last_error = 'sin_dispositivos'` (no se reintenta).
  - `push_finish(resultado)` en una llamada.
- **Recibos**: en el mismo tic, `push_receipts_pending()` → `https://exp.host/--/api/v2/push/getReceipts` →
  `DeviceNotRegistered` borra el token; el resto se marca revisado.
- **Lógica pura** aparte (`supabase/functions/enviar-avisos/logica.ts`, sin APIs de Deno): armar mensajes,
  trocear, clasificar tickets/recibos y calcular la espera. Se prueba con Jest.
- **Cron** (`ito-avisos`, `* * * * *`): `select private.avisos_tick()`. Solo llama a la función si hay trabajo
  (casi todos los minutos no hay: coste nulo). La URL y el secreto se leen de `vault.decrypted_secrets`
  (`avisos_url`, `avisos_secret`); nunca en git.
- **Limpieza** (en `run_daily_jobs` o un cron diario): `push_outbox` de más de 30 días, y tokens con `updated_at`
  de más de 120 días (la app los refresca en cada arranque).

## 6. Cliente

1. Dependencias: `npx expo install expo-notifications expo-dev-client`. `app.json`: plugin `expo-notifications`
   (`icon` monocromo de Android, `color` `#7B2433`), `ios.bundleIdentifier`, `android.package` y
   `extra.eas.projectId` (lo pone `eas init`). `eas.json` con perfil `development` (`developmentClient: true`,
   `distribution: internal`).
2. `lib/avisos/registro.ts`: `puedeRecibirPush()` (no Expo Go, `Device.isDevice`), `estadoPermiso()`,
   `pedirPermiso()`, `registrarDispositivo()` (canal Android `default` con importancia alta → token con
   `projectId` → `register_push_token`) y `olvidarDispositivo()`.
3. `lib/avisos/AvisosProvider.tsx` (dentro de `EstadoProvider`, activo con fase `lista`): registra al arrancar
   y al volver a primer plano si el permiso está concedido; escucha `addPushTokenListener`;
   `setNotificationHandler` (en primer plano: banner y lista, sin sonido) e invalida `pending_actions` y el
   calendario al recibir; al tocar (`useLastNotificationResponse`) → `router.push(url)` solo si `url` empieza por
   una ruta permitida (`lib/avisos/rutas.ts`, con pruebas).
4. Permiso: **no al arrancar**. Hoja inferior «¿Te avisamos de cobros, eventos y de lo que haga Meri?» la primera
   vez que se entra en `fase lista` tras esta versión (y desde Ajustes). Si iOS ya lo denegó: «Activa los avisos
   en Ajustes del iPhone» con `Linking.openSettings()`.
5. `lib/auth/acciones.ts:105`: `olvidarDispositivo()` **antes** de `signOut` (después ya no hay sesión para la RPC).
6. Ajustes (`app/ajustes/index.tsx`, `lib/ajustes/`): sección «Avisos» con el estado del permiso, los 6
   interruptores de §3.2 y «Probar aviso» (`send_test_push`; en Expo Go muestra «Necesita la app de desarrollo»).
7. Quitar «Los avisos llegarán cuando ito tenga notificaciones» de `components/gastos/FormularioRecurrente.tsx:461`
   y de `components/calendario/FormularioEvento.tsx` (en la fase 3, cuando lleguen de verdad).
8. `app/laboratorio`: botón «Aviso local de prueba» (`scheduleNotificationAsync` con `data.url`) para probar en
   Expo Go la navegación al tocar.

## 7. Fases

Cada fase se puede probar sola. Revisión del arquitecto en 1, 3 y 4 (RLS, secretos, Edge Function).

1. **Servidor base** — `supabase/migrations/20261123000000_avisos_base.sql`: §3.1, §3.2, §3.3, `enqueue_push`,
   `push_claim`/`push_finish`/recibos, `send_test_push`, `avisos_tick`, cron `ito-avisos` (si existen `pg_cron` y
   `pg_net`, como hace la migración del onboarding). `supabase/functions/enviar-avisos/index.ts` + `logica.ts`.
   Pruebas: Jest de `logica.ts`; en el SQL Editor, `register_push_token` con un token falso
   `ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]` + `send_test_push()` → en 1–2 min la fila pasa a `sent` o el token
   se borra por `DeviceNotRegistered` (prueba el camino entero sin móvil).
2. **Cliente** — §6.1–6.6 y 6.8. Pruebas Jest: `rutas.ts` (rutas permitidas), `puedeRecibirPush`, textos de
   Ajustes. Expo Go: Ajustes, permiso, aviso local. Build de desarrollo: «Probar aviso» llega con la app abierta,
   en segundo plano y cerrada; al tocar abre ito.
3. **Avisos programados** — `20261124000000_avisos_programados.sql`: `check` de `reminder_minutes`,
   `planned_payment_dates` (+ `calendar_range` usándola), `format_money`, `enqueue_scheduled` (§4.1). §6.7.
   Pruebas SQL en el pie de la migración con `p_now` fijo: evento con hora y todo el día (incl. cambio de hora del
   29 mar), semanal con una fecha anulada, cumpleaños 29 feb en año no bisiesto, **evento secreto → 0 filas para
   la pareja**, recurrente privado → 0 filas para la pareja, recurrente en pausa → 0, cobro «el mismo día» con el
   occurrence ya creado, preferencia desactivada → 0, ejecutar dos veces → sin duplicados, evento creado después
   del instante → 0. Comparar `calendar_range` antes y después del cambio en un rango de 100 días.
4. **Acciones de la pareja** — `20261125000000_avisos_pareja.sql`: triggers de §4.2. Pruebas SQL: cada acción
   encola una fila para el otro y ninguna para quien actúa; el job diario no encola gastos; un fallo en
   `enqueue_push` no deshace la operación.
5. **Prueba con dos móviles** (David y María) y ajuste de textos. Actualizar `docs/estado.md`.

## 8. Riesgos

1. **Filtrar un secreto o algo privado**: `enqueue_*` es `security definer` y no ve la RLS. Cada regla de
   destinatarios de §4 copia la de la RLS/`pending_actions`; las pruebas de la fase 3 lo cubren.
2. **Sin cuenta de Apple Developer de pago no hay push en iPhone** (ni build de desarrollo con push).
3. **Duplicados**: `dedupe_key` única; el único duplicado posible es un timeout de Expo tras haberlo recibido (raro, aceptado).
4. **Avisos a destiempo**: `reminder_minutes` se interpreta como en `lib/calendario/evento.ts:134`; si la app cambia
   ese significado hay que cambiar `enqueue_scheduled`. La zona de la pareja ya la fija el servidor.
5. **Token de otra cuenta en el mismo móvil**: resuelto por `register_push_token` (reasigna) y `olvidarDispositivo` al salir.
6. **Una sola regla de pagos previstos**: si `planned_payment_dates` diverge de `calendar_range`, el aviso dice un
   día y el calendario otro; por eso se comparte y se compara en la fase 3.

## 9. Lo que hace David a mano

**Antes de la fase 1 (Supabase)**
1. Database → Extensions: activar `pg_net` (y comprobar que `pg_cron` está activo).
2. Generar un secreto largo (p. ej. `openssl rand -hex 32`) y en el SQL Editor:
   `select vault.create_secret('https://<ref>.supabase.co/functions/v1/enviar-avisos', 'avisos_url');`
   `select vault.create_secret('<secreto>', 'avisos_secret');`
3. Edge Functions → Secrets: `AVISOS_SECRET` (el mismo) y `EXPO_ACCESS_TOKEN` (paso 6).
4. Desplegar `enviar-avisos` como `borrar-cuenta`, **con «Verify JWT» desactivado**.
5. Aplicar cada migración en el SQL Editor cuando toque.

**Antes de la fase 2 (Expo / Apple)**
6. Cuenta en expo.dev → Access tokens → crear uno («Enhanced security for push» activado en el proyecto).
7. `npm i -g eas-cli`, `eas login`, `eas init` (añade `projectId`).
8. Apple Developer Program activo. `eas device:create` para registrar el iPhone de David (y el de María).
9. `eas build --profile development --platform ios`: cuando pregunte, dejar que EAS cree el certificado y la
   **clave de push (APNs)**. Instalar con el QR. Luego `npx expo start --dev-client`.
10. Si María tiene Android: proyecto de Firebase, `google-services.json` en el repo (no es secreto) y subir la
    clave de cuenta de servicio FCM v1 con `eas credentials`; `eas build --profile development --platform android`.

## 10. Decisiones para David

1. **¿Tienes Apple Developer Program de pago (99 $/año)?** Sin él no hay push en iPhone. *Bloquea la fase 2 en
   móvil real; las fases 1, 3 y 4 se pueden hacer igual.*
2. **¿El móvil de María es iPhone o Android?** Android añade el paso 10.
3. `bundleIdentifier` / `package`: recomendado `com.davidelox.ito` (no se puede cambiar tras publicar).
4. Destinatarios (recomendado, ya en §4): evento de una sola persona → solo esa persona; cumpleaños → los dos;
   cobro compartido → los dos.
