# ito: plan de implementación del primer uso (onboarding)

> 2026-11-14 · Arquitecto. Fuentes: `docs/especificacion-correcciones.md` (manda, §6), `docs/concepto.md`, `docs/modelo-datos.md`, `supabase/migrations/20261113000000_esquema_inicial.sql`, `lib/supabase.ts`, `app/_layout.tsx`, `components/hilo/` y los mockups 1–6 (Bienvenida, Crear o unirse, Tu perfil y color, Unirse, Invitar, Inicio vacío).
> Alcance: Bienvenida, cuenta con email (registro, confirmación, entrada, recuperación), crear o unirse, perfil (nombre, color, foto), invitar y entrada a las pestañas. **Fuera**: «Cómo os organizáis el dinero» (paso 3 de 4 del mockup), Apple y Google (queda el hueco), borrar la cuenta.

---

## 1. Decisiones clave

1. **El orden lo marca la especificación y lo impone la base de datos**: Bienvenida → cuenta → Crear o unirse → Tu perfil → (Dinero, más adelante) → Invitar → Inicio. El color vive en `couple_members.color` (único por pareja), así que el perfil **solo puede completarse después** de crear o unirse. El encargo lo lista al revés; manda la especificación.
2. **Guardas con `Stack.Protected` de Expo Router** (disponible en SDK 58), no `<Redirect>` en cada pantalla. Un único estado derivado (`fase`) decide qué grupo de rutas existe. Al cambiar la fase, el router lleva solo a la pantalla correcta y el botón Atrás no puede volver a una fase superada.
3. **Confirmación del email: código de 6 cifras como camino principal**, enlace como atajo. El código funciona igual en web, Expo Go y la app instalada, en otro dispositivo y con escáneres de enlaces del correo. El enlace usa **PKCE** (`flowType: 'pkce'`): en la URL de vuelta solo viaja un `code` de un solo uso que no sirve sin el verificador guardado en el dispositivo. **Nunca** se usa el flujo implícito (tokens en la URL), aunque sea el ejemplo de la guía de Supabase para Expo.
4. **Sesión en nativo en `expo-secure-store`**, con un adaptador que trocea el valor (Keychain / Keystore). En web, `localStorage` (lo que ya hace AsyncStorage en web). *Alternativa*: el patrón `LargeSecureStore` de Supabase (clave AES en SecureStore y datos cifrados en AsyncStorage); obliga a añadir `aes-js` y a manejar cifrado a mano.
5. **«Pareja incompleta» no bloquea**: quien crea entra en las pestañas tras Invitar («Continuar sin esperar»), e Inicio muestra «Tu pareja aún no se ha unido · Ver código». Así lo piden la especificación y el concepto («se puede seguir sin esperar a la pareja»). No hay pantalla de espera bloqueante.
6. **Sin vista previa del espacio antes de unirse.** El mockup de Unirse muestra «David te ha invitado · Código válido» y su configuración antes de pulsar «Unirme». Eso exige una RPC que devuelva nombre y ajustes a cualquiera que acierte un código: un oráculo de enumeración. Propuesta: «Unirme» canjea directamente y esa información aparece en el paso siguiente (Tu perfil). Necesita el visto bueno de David (§12).
7. **BotonNudo solo donde se ata algo**: «Unirme» y «Continuar» de Tu perfil. Las pantallas de cuenta usan el botón principal normal con indicador de carga.
8. **Cierre de registros**: cuando David y María tengan cuenta, se desactiva el alta de usuarios nuevos en Supabase. Es la medida que más superficie quita: sin altas no hay enumeración por registro, ni spam, ni cuentas para forzar códigos.

---

## 2. Rutas y máquina de estados

### 2.1 Fases

```ts
type Fase =
  | 'cargando'      // restaurando sesión o leyendo la pareja sin caché
  | 'sin_sesion'
  | 'sin_conexion'  // hay sesión, no hay caché de la fase y la red falla: pantalla «Reintentar»
  | 'sin_pareja'    // sesión sin fila activa en couple_members
  | 'sin_perfil'    // miembro, pero display_name vacío o color null
  | 'invitar'       // m1, solo, y aún no ha pasado por Invitar en este dispositivo
  | 'lista';        // perfil completo (con o sin pareja unida)

type EstadoApp = {
  fase: Fase;
  userId: string | null;
  pareja: {
    coupleId: string;
    yo: Miembro;            // slot, color, display_name, avatar_path
    otra: Miembro | null;   // null si aún no se ha unido
  } | null;
  refrescar: () => Promise<void>;
};
```

Reglas de derivación (en `lib/pareja/EstadoProvider.tsx`):
- `perfilCompleto = display_name.trim() !== '' && yo.color !== null`.
- `invitar` = `yo.slot === 'm1' && otra === null && !invitacionVista`. `invitacionVista` es una marca local `ito.invitacion_vista.<coupleId>` en AsyncStorage que se pone al pulsar «Continuar sin esperar» o cuando la pareja se une. No necesita columna nueva: si David entra desde otro dispositivo, verá Invitar una vez más, y eso es útil.
- El paso Dinero se añadirá más adelante como otra fase entre `sin_perfil` e `invitar`.

### 2.2 Árbol de rutas

```
app/
  _layout.tsx                  ← proveedores + Stack con Stack.Protected + splash
  auth/callback.tsx            ← SIN guarda: procesa ?code= o ?error= del enlace del email
  (auth)/                      ← guard: fase === 'sin_sesion'
    _layout.tsx
    bienvenida.tsx             ← 1 · Bienvenida
    crear-cuenta.tsx
    entrar.tsx
    verificar.tsx              ← código de 6 cifras (registro y recuperación)
    recuperar.tsx              ← pedir código para cambiar la contraseña
    nueva-contrasena.tsx       ← tras verificar el código de recuperación (ver 3.6)
  (onboarding)/                ← guard: fase ∈ {sin_pareja, sin_perfil, invitar}
    _layout.tsx                ← Stack.Protected anidados por fase
    pareja.tsx                 ← 2 · Crear o unirse      (sin_pareja)
    unirse.tsx                 ←     Unirse              (sin_pareja)
    perfil.tsx                 ← 3 · Tu perfil y color   (sin_perfil)
    invitar.tsx                ← 5 · Invitar             (invitar)
  sin-conexion.tsx             ← guard: fase === 'sin_conexion'
  (tabs)/                      ← guard: fase === 'lista'
  pareja/invitar.tsx           ← guard: fase === 'lista' (desde Inicio «Ver código»; reutiliza el componente)
  laboratorio/                 ← guard: __DEV__
```

- **Rutas únicas**: nada de `index.tsx` en `(auth)` ni en `(onboarding)`. En web, dos grupos con la misma URL `/` chocan. `(tabs)/index.tsx` se queda como `/`.
- **El orden del `Stack` importa**: cuando la pantalla visible deja de estar permitida, Expo Router salta a la primera ruta disponible. Por eso cada grupo solo existe en su fase, y dentro de `(onboarding)` cada pantalla tiene su `Stack.Protected` propio.
- `typedRoutes`: las rutas nuevas aparecen en los tipos tras arrancar `expo start` una vez.

### 2.3 Sin parpadeos al arrancar, y encaje con el splash del hilo

1. `SplashScreen.preventAutoHideAsync()` sigue en el módulo. El splash nativo se oculta cuando **se cumplen las dos cosas**: fuentes cargadas y `fase !== 'cargando'`.
2. Restaurar la sesión es local (SecureStore o localStorage): unos milisegundos. Leer la pareja necesita red, así que se guarda en caché la **última fase conocida por usuario**: `ito.fase.<userId>`, solo el enum, nada personal. Con caché, la fase se decide al instante y se revalida en segundo plano. Sin caché, se espera a la red hasta 2,5 s y después se pasa a `sin_conexion`, con «Reintentar».
3. **SplashHilo necesita saber adónde va.** Hoy termina siempre en el ancla de la barra de pestañas (`relevo.ts`). Si la fase no es `lista`, no hay barra y el hilo acabaría en una barra inexistente. Cambio: prop `destino: 'barra' | 'centro'` en `components/hilo/SplashHilo.tsx`. Con `'centro'`, el hilo hace el tirabuzón y se recoge, y la capa se funde (como la versión de «Reducir movimiento», pero con recorrido). `terminar()` ya llama a `entregarHilo()` siempre, así que la barra no se queda esperando el relevo cuando se llegue a las pestañas más tarde. Hay que comprobarlo en el paso 10.
4. La capa del splash tapa la pantalla mientras dura (`TOTAL_MS` = 2130 ms): el `Stack.Protected` ya ha montado el grupo correcto debajo y no se ve ningún salto.

---

## 3. Sesión y autenticación

### 3.1 Cliente (`lib/supabase.ts`, a modificar)

```ts
createClient(url, key, {
  auth: {
    storage: Platform.OS === 'web' ? undefined /* localStorage */ : almacenSesionSeguro,
    flowType: 'pkce',
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // el enlace lo procesa app/auth/callback.tsx en todas las plataformas
  },
});
```

`almacenSesionSeguro` (`lib/auth/almacenSesion.ts`):
- Cumple `SupportedStorage` (`getItem`, `setItem` y `removeItem` asíncronos).
- Trocea en partes de 1800 caracteres: `clave.0`, `clave.1`, … y, al final, `clave.n` con el número de partes.
- **Falla cerrado**: si una parte falta o el JSON no se puede leer, devuelve `null`. El efecto es un cierre de sesión, nunca un fallo de la app.
- Opción `keychainAccessible: AFTER_FIRST_UNLOCK`, para que el refresco funcione con el móvil bloqueado.
- **Reinstalación en iOS**: el Keychain sobrevive a desinstalar la app. En el primer arranque, si no existe la marca `ito.instalada` en AsyncStorage (que sí se borra), se borran las claves de sesión de SecureStore y se crea la marca.
- Ya no hay que migrar sesiones: nadie ha iniciado sesión con el cliente actual.

### 3.2 Proveedor de sesión (`lib/auth/SesionProvider.tsx`)

```ts
type Sesion = { estado: 'cargando' | 'sin_sesion' | 'con_sesion'; userId: string | null; session: Session | null };
export function SesionProvider(props: { children: ReactNode }): JSX.Element;
export function useSesion(): Sesion;
```

- Se suscribe una vez a `supabase.auth.onAuthStateChange`. El evento `INITIAL_SESSION` trae la sesión restaurada, así que no hace falta `getSession()` aparte.
- **No se llama a Supabase dentro del callback** con `await`: la propia librería advierte de bloqueos. Lo que haya que hacer se aplaza con `setTimeout(…, 0)`.
- `TOKEN_REFRESHED` actualiza la sesión, pero `userId` no cambia: los consumidores dependen de `userId` y no se vuelven a pintar cada hora.
- `SIGNED_OUT` (también cuando el refresco falla porque el token se ha revocado):
  - `supabase.removeAllChannels()`;
  - vaciar la caché de URLs firmadas;
  - borrar `ito.fase.<userId>`;
  - aviso «Tu sesión ha terminado. Vuelve a entrar.» si no lo pidió el usuario.
- Sin conexión, el refresco falla con error de red, la librería reintenta y **no** se cierra la sesión.
- El refresco en primer plano con `AppState` ya está en `lib/supabase.ts`.
- **Cerrar sesión**: `supabase.auth.signOut({ scope: 'local' })`, solo este dispositivo. «Cerrar sesión en todos los dispositivos» (`global`) irá en Ajustes. Mientras no haya Ajustes, el botón va en el laboratorio o en un menú provisional de la cabecera de Inicio.

### 3.3 Acciones de cuenta (`lib/auth/acciones.ts`) y errores neutros (`lib/auth/errores.ts`)

```ts
crearCuenta(email: string, password: string): Promise<Resultado>;   // signUp + emailRedirectTo
verificarCodigo(email: string, codigo: string, tipo: 'email' | 'recovery'): Promise<Resultado>; // verifyOtp
reenviarCodigo(email: string): Promise<Resultado>;                   // resend({ type: 'signup' })
entrar(email: string, password: string): Promise<Resultado>;         // signInWithPassword
pedirRecuperacion(email: string): Promise<Resultado>;                // resetPasswordForEmail
cambiarContrasena(password: string): Promise<Resultado>;             // updateUser
cerrarSesion(): Promise<void>;
type Resultado = { ok: true } | { ok: false; mensaje: string; reintentarEn?: number };
```

- El email se normaliza con `trim().toLowerCase()` antes de enviarlo.
- Las pantallas **nunca** muestran `error.message` de Supabase. Se traduce por `error.code` o `status`:

| Situación | Texto |
|---|---|
| `invalid_credentials` | «El email o la contraseña no son correctos.» |
| `email_not_confirmed` | Lleva a Verificar: «Confirma tu email para entrar. Te enviamos un código.» Solo aparece con la contraseña correcta, así que no delata nada (comprobarlo en el paso 4). |
| Registro con un email que ya existe | Supabase no da error con la confirmación activa (devuelve un usuario sin `identities`). La app actúa **igual que con un email nuevo**: «Revisa tu correo. Si el email no tenía cuenta, te hemos enviado un código.» y un enlace «¿Ya tienes cuenta? Entra». |
| Recuperación | Siempre «Si hay una cuenta con ese email, te llegará un código.» |
| `weak_password` | «Tu contraseña necesita al menos 8 caracteres, con letras y números.» |
| `otp_expired`, código no válido | «El código no es válido o ha caducado. Pide uno nuevo.» |
| 429, `over_email_send_rate_limit`, `over_request_rate_limit` | «Has hecho demasiados intentos. Espera unos minutos.» |
| Error de red | «No hay conexión. Inténtalo de nuevo.» |
| Cualquier otro | «Algo ha fallado. Inténtalo de nuevo.» |

### 3.4 Contraseña y límites de intentos

- **Política en el servidor** (panel, §7): mínimo 8 caracteres, con letras y números. El cliente valida lo mismo antes de enviar: de 8 a 72 caracteres (bcrypt no admite más de 72 bytes).
- Un solo campo con «Mostrar / Ocultar». No se bloquea pegar, para que funcionen los gestores de contraseñas. `textContentType` y `autoComplete`: `username` y `email` en el email; `newPassword` y `new-password` al crear la cuenta; `password` al entrar.
- **Límites reales en el servidor** (Authentication → Rate Limits): inicios de sesión y registros por IP, verificaciones de código por IP y envío de emails. Con 6 cifras y el límite por defecto de verificaciones (del orden de 30 cada 5 minutos por IP), acertar un código en su hora de vida tiene una probabilidad del 0,04 %.
- **En el cliente**, solo para la experiencia: tras 5 fallos seguidos al entrar, el botón se bloquea 30 s con cuenta atrás. «Reenviar código» se bloquea 60 s, como el servidor.

### 3.5 Confirmación del email

**Camino principal: el código de 6 cifras.**
1. `crearCuenta` llama a `signUp({ email, password, options: { emailRedirectTo: urlCallback() } })`. Con la confirmación obligatoria no devuelve sesión.
2. La app navega a `(auth)/verificar`. **El email no va en los parámetros de la ruta**: en web se convertiría en `?email=…` de la URL y del historial. Se guarda en memoria, en un contexto `FlujoCuenta` dentro de `(auth)/_layout.tsx`. Si se pierde (al recargar la web), Verificar pide el email otra vez.
3. El usuario escribe el código y la app llama a `verifyOtp({ email, token, type: 'email' })`, que crea la sesión. Si el proyecto rechaza `'email'` para una confirmación de registro, se usa `'signup'`, que está obsoleto pero se admite. Hay que comprobarlo en el paso 4.
4. Campo del código: un solo `TextInput` (no 6 cajas: se lee mejor con lector de pantalla y se puede pegar), con `keyboardType="number-pad"`, `textContentType="oneTimeCode"` y `autoComplete="one-time-code"`. Acepta de 6 a 10 cifras por si el proyecto tiene otra longitud configurada. Se envía solo al completar 6.

**Atajo: el enlace** `{{ .ConfirmationURL }}` (https, se puede pulsar en cualquier cliente de correo):
1. Supabase verifica el email y redirige a `emailRedirectTo` con `?code=…` (PKCE).
2. `app/auth/callback.tsx` lee `code`, o `error` y `error_code`, con `useLocalSearchParams` y llama a `supabase.auth.exchangeCodeForSession(code)`. Después hace `router.replace('/')`, que en web también quita el `code` de la barra y del historial, y la guarda decide la pantalla.
3. **Si el intercambio falla** (enlace abierto en otro dispositivo o navegador, sin verificador), el email **ya está confirmado**. Texto: «Tu email está confirmado. Entra con tu contraseña.» y botón a Entrar.
4. Con `?error=` (por ejemplo `otp_expired`): «El enlace ha caducado o ya se ha usado. Si ya confirmaste tu email, entra con tu contraseña; si no, pide un código nuevo.» Nunca se muestra `error_description`.
5. Nunca se registra la URL entrante.

**URL de vuelta** (`lib/auth/enlaces.ts`): `urlCallback = () => Linking.createURL('auth/callback')`. Devuelve:
- web: `http://localhost:8081/auth/callback`;
- Expo Go: `exp://<IP>:8081/--/auth/callback`;
- desarrollo o producción: `ito://auth/callback`.

**Por qué el código es el camino principal en Expo Go:**
- El atajo depende de que el navegador del móvil acepte saltar de https a `exp://` o a `ito://`. Chrome en Android a veces lo bloquea.
- La IP de `exp://` cambia con la red.
- Los escáneres de enlaces del correo pueden abrir el enlace antes que el usuario. Con el código no pasa nada de eso. Si un escáner consume el token, el email queda confirmado igualmente y el usuario entra con su contraseña (Verificar lo ofrece: «¿Ya está confirmado? Entra»).

### 3.6 Recuperar la contraseña

- `resetPasswordForEmail(email)`. La plantilla «Reset password» solo lleva `{{ .Token }}`, sin enlace.
- Verificar con `type: 'recovery'` crea una sesión de recuperación. A partir de ahí, `nueva-contrasena.tsx` llama a `updateUser({ password })`.
- Mientras `FlujoCuenta.modo === 'recuperacion'`, la fase sigue siendo `sin_sesion` aunque ya haya sesión, para que la guarda no salte a la app antes de cambiar la contraseña.
- Si el proyecto tiene activado «Secure password change», el cambio funciona porque la sesión es reciente.

### 3.7 Hueco para Apple y Google

- `lib/auth/proveedores.ts`: `export const PROVEEDORES_SOCIALES: ProveedorSocial[] = []` (`'apple' | 'google'`) y una firma `entrarConProveedor(p: ProveedorSocial): Promise<Resultado>` que por ahora lanza «no disponible».
- Bienvenida pinta un botón por proveedor de la lista. Hoy la lista está vacía y solo se ve «Usar mi email».
- **Recomendación para después**: token nativo, con `signInWithIdToken`:
  - Apple con `expo-apple-authentication`;
  - Google con `@react-native-google-signin/google-signin`, que necesita build de desarrollo.

  Así se evita el OAuth por navegador. `handle_new_user` ya rellena el nombre con `full_name` o `name` de los metadatos.
- `expo-web-browser` (ya instalado) solo haría falta para el OAuth por navegador.

---

## 4. Pareja y perfil

### 4.1 Lectura del estado (`lib/pareja/EstadoProvider.tsx`)

- Una consulta, después de `useSesion().estado === 'con_sesion'`:

  ```
  supabase.from('couple_members')
    .select('couple_id, user_id, slot, color, left_at, profiles(display_name, avatar_path)')
  ```

  - La RLS ya limita a mi pareja activa, pero incluye a quien haya salido: se filtra `left_at is null` para la `otra`.
  - Mi perfil se lee aparte (`profiles` donde `id = userId`) por si aún no tengo pareja.
- **Tiempo real**: canal `couple_members` con filtro `couple_id=eq.<id>`.
  - Cuando la otra persona se une (`INSERT`) o elige color (`UPDATE`), se refresca.
  - `profiles` **no está en la publicación**, así que el nombre de María no llega en vivo. Se resuelve con la migración nueva (§6), que lo añade. Mientras tanto, como María guarda primero el nombre y después el color, el `UPDATE` de su color sirve de aviso para releer los perfiles.
- `refrescar()` se llama tras cada acción de pareja. Los cambios de fase solo se aplican **cuando termina la animación del nudo** (`onHecho` de BotonNudo), para que la guarda no cambie de pantalla en mitad del nudo.

### 4.2 Acciones (`lib/pareja/acciones.ts`)

```ts
crearEspacio(): Promise<Resultado>;              // rpc('create_couple')
unirse(codigo: string): Promise<Resultado>;      // rpc('join_couple', { p_code })
codigoVigente(): Promise<{ codigo: string; caduca: Date } | null>;
nuevoCodigo(): Promise<Resultado>;               // rpc('create_invitation')
salirDelEspacio(): Promise<Resultado>;           // rpc('leave_couple')
guardarPerfil(datos: { nombre: string; color: ColorPersona; foto?: FotoElegida | null }): Promise<Resultado>;
```

- **`crearEspacio`**: un doble toque provoca `23505` (índice de una sola pareja activa). Se trata como éxito y se refresca.
- **`unirse`**:
  - Se normaliza igual que el servidor (mayúsculas y solo alfanuméricos). `join_couple` devuelve `{ok:false}` sin lanzar error, así que la acción lo convierte en rechazo para que el nudo se suelte.
  - Errores:

    | Código | Texto |
    |---|---|
    | `invalid_code` | «Ese código no existe. Revísalo con tu pareja.» |
    | `code_used` | «Ese código ya se ha usado. Pide a tu pareja uno nuevo.» |
    | `code_expired` | «Ese código ha caducado. Pide a tu pareja uno nuevo.» |
    | `couple_full` | «Ese espacio ya está completo.» |
    | `too_many_attempts` | «Has probado demasiados códigos. Vuelve a intentarlo dentro de una hora.» |
    | `already_in_couple` | Se refresca la fase. |
- **`codigoVigente`**: `couple_invitations` con `used_at is null and revoked_at is null`, ordenado por `created_at desc` y con límite 1. Si ha caducado: «Este código ha caducado» y «Crear otro código».
- **`guardarPerfil`**, en este orden:
  1. Sube la foto si la hay.
  2. `update profiles set display_name, avatar_path`.
  3. `update couple_members set color` en mi fila.
  4. Borra la foto anterior, sin bloquear si falla.

  Si el paso 3 da `23505` (`unique (couple_id, color)`), la otra persona acaba de coger ese color: «Ese color lo acaba de elegir tu pareja. Elige otro.» y se refresca. No hace falta una RPC atómica: la fase solo pasa a `lista` cuando están el nombre **y** el color.
- **«¿Te has equivocado?»** en Invitar (solo m1 y solo): «Tengo un código de mi pareja» → confirmación «Se borrará el espacio que acabas de crear» → `leave_couple()`, que lo borra porque queda vacío → fase `sin_pareja` → Unirse.

### 4.3 Colores de persona

- El enum de la base es español (`menta`, `lavanda`, `melocoton`, `aguamarina`, `pistacho`, `malva`) y `constants/theme.ts` usa claves inglesas (`mint`, `lavender`…). Se añade en `constants/theme.ts` el tipo `ColorPersona` (el enum de la base) y el mapa `colorPersona: Record<ColorPersona, { bg; ink; nombre }>` con el nombre visible («Melocotón»).
- **Recomendación**: renombrar las claves de `personColors` al español en el mismo paso y tocar los dos usos de `components/hilo/HiloSaldar.tsx:266-270`. Una sola nomenclatura evita tener que traducir entre las dos.
- Preselección: el primer color libre en el orden de la paleta. Así David queda en menta y María en lavanda, como dice la especificación.
- El color de la otra persona aparece desactivado con «Lo usa David» (`accessibilityState={{ disabled: true }}`).
- Los colores de persona nunca se usan en botones ni en estados: el anillo de selección va en la tinta del propio color, como en el mockup.

### 4.4 Foto de perfil (privada, con URL firmada)

- **Elegir**: `expo-image-picker` (`launchImageLibraryAsync`, `allowsEditing: true`, `aspect: [1, 1]`, solo imágenes). El permiso se pide al pulsar «Añadir foto», no al abrir la pantalla.
- **Preparar**: `expo-image-manipulator`, para redimensionar a 512×512 y guardar en JPEG con calidad 0,8. Volver a codificar **elimina el EXIF** (la ubicación GPS de la foto); `exif: false` del selector no basta.
- **Subir**: `storage.from('avatars').upload(\`${userId}/${uuid}.jpg\`, arrayBuffer, { contentType: 'image/jpeg', upsert: false })`.
  - Un nombre nuevo en cada cambio evita cachés obsoletas.
  - La política `avatars_write` ya obliga a que la carpeta sea el propio `user_id`.
- **Mostrar** (`lib/avatar.ts`):
  - `useUrlAvatar(path)` llama a `createSignedUrl(path, 3600)` y guarda las URLs en memoria, renovándolas a los 50 minutos.
  - Se pinta con `expo-image` y `cacheKey: path`. El disco se indexa por la ruta y no por la URL firmada, que cambia en cada renovación.
  - **Las URLs firmadas no se registran ni se guardan en AsyncStorage.**
  - Sin foto, el avatar es la inicial en la tinta sobre el fondo pastel.
- El bucket sigue siendo privado. `avatars_select` solo deja ver la tuya y la de tu pareja, porque la subconsulta aplica la RLS de `profiles`.

---

## 5. Seguridad y datos sensibles

### 5.1 Reglas para el código (las revisa el arquitecto en el paso 12)

1. **Registro seguro** (`lib/registro.ts`): `registrarError(contexto: string, error: unknown)`.
   - En `__DEV__` escribe solo `{ contexto, code, status, name }`.
   - En producción no escribe nada.
   - Nunca escribe `message` ni `details`: los de PostgREST pueden incluir valores, como `Key (couple_id, color)=(…)`.
   - Regla de ESLint `no-console` (error) en `app/` y `lib/`, salvo en `lib/registro.ts`.
2. **Nada sensible en URLs**:
   - ni email, ni código OTP, ni contraseña, ni nombre en los parámetros de ruta;
   - el `code` PKCE se limpia con `router.replace`;
   - el texto para compartir el código de invitación lleva solo el código.
3. **Ni analítica ni informes de errores** en esta fase. Si se añade Sentry más adelante: `sendDefaultPii: false` y un `beforeSend` que quite las URLs y los cuerpos.
4. **Repositorio**: `.env` y `.env.local` ya están en `.gitignore`. En la app solo va la clave publishable. La plantilla de email y la configuración SMTP viven en el panel, no en git.
5. **El email no se copia a `profiles`**. La pareja no ve tu email en ningún sitio: solo está en `auth.users`.
6. **Campos de contraseña**: `secureTextEntry`. El valor no sale del componente salvo hacia `acciones.ts` y no se guarda en el estado global. Al salir de la pantalla se descarta.

### 5.2 Revisión de la migración aplicada para este flujo

Ordenado por importancia. Ninguno bloquea empezar a programar.

| # | Hallazgo | Escenario que falla | Gravedad | Arreglo |
|---|---|---|---|---|
| 1 | **Los buckets no tienen límite de tamaño ni de tipo MIME.** | Un cliente sube a `avatars/{su_id}/` un fichero de 500 MB, o un `.html` con `text/html` que se sirve desde el dominio de Storage. | Media | Migración nueva: `file_size_limit` y `allowed_mime_types` en `avatars` (2 MB; jpeg, png, webp) y en `receipts` (10 MB; imágenes y pdf). |
| 2 | **Quien sale bloquea su hueco para siempre.** `create_invitation` y `join_couple` comprueban `slot = 'm2'` sin mirar `left_at`. | María sale por error. David ya no puede generar un código (`TW003`) y María no puede volver (`couple_full`). La única salida es que David también salga y empiece de cero, y con eso pierde lo compartido. | Media (no afecta al primer uso) | Decisión de David (§12). Propuesta: solo **la misma persona** puede volver a su hueco (se reactiva su fila con `left_at = null`). Una persona distinta, espacio nuevo, porque los gastos guardados como m2 se le atribuirían a ella. |
| 3 | **`profiles.avatar_path` acepta cualquier texto.** | Alguien guarda `avatar_path = '<id de otra persona>/x.jpg'` o una ruta de `receipts`. La RLS de Storage impide leer lo ajeno, así que no hay fuga, pero la app intentaría firmar rutas que no son suyas. | Baja | `check (avatar_path is null or avatar_path ~ ('^' \|\| id::text \|\| '/[A-Za-z0-9._-]+$'))`. |
| 4 | **`profiles` no está en la publicación de Realtime.** | María se une y pone su nombre. En la pantalla Invitar de David, el nombre no aparece hasta que se recarga. | Baja | Añadir `public.profiles` a `supabase_realtime`. La RLS filtra por suscriptor. |
| 5 | **Privilegios por defecto de Supabase.** El `revoke` de la migración solo cubre lo que ya existe. | En una migración futura, una tabla o función nueva en `public` vuelve a quedar con permisos para `anon` y `public` por los privilegios por defecto. La RLS protege las tablas, pero una función `security definer` nueva quedaría ejecutable sin sesión. | Baja hoy, alta si se olvida | `alter default privileges in schema public revoke all on tables from anon;` y `… revoke execute on functions from public, anon;`. |
| 6 | **`private.join_attempts` no se limpia nunca.** | Crece sin límite. Es irrelevante con dos usuarios. | Muy baja | Tarea pg_cron aparte, `ito-limpieza` (diaria), que borre los intentos de más de 1 día. Así no se reescribe `run_daily_jobs`. |
| 7 | `couples_update` deja a cualquiera de los dos cambiar `currency`. | Si se cambia la moneda con gastos ya creados, los gastos nuevos fallan con `TW014`. | Baja (no está en este flujo) | Para más adelante: bloquear `currency` si hay gastos. |

**Comprobado y correcto:**
- **Enumeración de códigos**: hay 31⁶ ≈ 887 millones de códigos y como mucho uno vivo por pareja, con 10 intentos por hora y usuario, contados antes de comprobar el código y sin excepción, así que el intento queda guardado. Con el registro cerrado (decisión 8) no se pueden multiplicar las cuentas.
  - El sesgo del módulo 31 en `generate_invite_code` es despreciable.
  - Distinguir `code_used` o `code_expired` de `invalid_code` solo revela códigos que ya no sirven.
- **Unirse a una pareja llena**: lo impiden tres cosas:
  - el `for update` sobre la invitación y sobre `couples`, que serializa las uniones;
  - la comprobación de m2;
  - `unique (couple_id, slot)` como última barrera.

  Un usuario no puede estar en dos parejas, por `couple_members_one_active_idx`. No puede unirse a su propia pareja (`already_in_couple`), ni generar códigos con la pareja completa.
- `handle_new_user` solo toma el nombre de los metadatos, que es un dato del propio usuario y está limitado a 40 caracteres.
- Las políticas de `profiles`, `couple_members` (solo tu fila; el trigger bloquea `slot` y `left_at`) y `avatars_*` son correctas para este flujo.

### 5.3 Migración nueva propuesta (solo descrita; no se aplica sin el visto bueno de David)

`supabase/migrations/20261114000000_onboarding_endurecer.sql`:
- **Parte A (recomendada ya)**: los puntos 1, 3, 4, 5 y 6 de la tabla anterior.
- **Parte B (si David la aprueba)**: el punto 2.
  - `create_invitation` y `join_couple` cuentan solo a los miembros activos.
  - `join_couple` reactiva la fila si `v_uid` ya fue miembro de esa pareja.
  - Si el hueco m2 lo ocupó otra persona que ya salió, sigue respondiendo `couple_full`.

Se prueba con PGlite como la inicial y después se aplica con `supabase db push` o pegándola en el editor SQL.

---

## 6. Librerías

Todas están en el SDK de Expo y vienen incluidas en Expo Go, así que no hace falta build de desarrollo. Se instalan con `npx expo install <paquete>` para que resuelva la versión del SDK 58 (`~58.0.x`); no se fija la versión a mano.

| Paquete | Estado | Para qué | Expo Go |
|---|---|---|---|
| `expo-secure-store` | instalar | Sesión en Keychain / Keystore | Sí (en web no existe: se usa localStorage) |
| `expo-image-picker` | instalar | Foto de perfil | Sí (los textos de permiso de iOS son los de Expo Go; en la build van en el plugin de `app.json`) |
| `expo-image-manipulator` | instalar | Redimensionar y quitar el EXIF | Sí |
| `expo-clipboard` | instalar | «Copiar código» | Sí |
| `expo-linking` | ya está (`~58.0.17`) | `createURL` para `emailRedirectTo` | Sí |
| `expo-web-browser` | ya está (`~58.0.8`) | Solo para OAuth futuro | Sí |
| `expo-image` | ya está | Avatar con `cacheKey` | Sí |

- Compartir el código usa `Share` de React Native: sin dependencia.
- `expo-crypto` (instalar, en Expo Go): `randomUUID()` para el nombre de la foto. No se confía en que `crypto.randomUUID` global exista en Hermes, y además hará falta para los `uuid` generados en el cliente (gastos sin conexión).
- Hay que añadir el plugin de `expo-image-picker` en `app.json` con los textos de permiso en español (fotos sí, cámara no). Solo afecta a la build, no a Expo Go.

---

## 7. Lo que tiene que hacer David en el panel de Supabase

Los nombres de los menús son los actuales del panel. Si alguno ha cambiado, el ajuste es el mismo.

1. **Authentication → Emails → SMTP Settings**: configurar **SMTP propio antes de que María se registre**. Sin él, Supabase solo envía a los miembros del equipo del proyecto, y como mucho 2 emails por hora.
   - Recomendación: Brevo gratuito, que permite verificar un único remitente sin dominio propio.
   - Las credenciales SMTP se pegan en el panel y **no van a ningún archivo del repositorio**.
2. **Authentication → URL Configuration**:
   - **Site URL**: `http://localhost:8081`. Se cambiará cuando haya build o dominio.
   - **Redirect URLs** (con «Add URL», una por una):
     - `http://localhost:8081/**`
     - `ito://**`
     - `exp://**`: solo durante el desarrollo; hay que quitarla antes de publicar. Con PKCE, un `code` desviado no sirve sin el verificador del dispositivo.
3. **Authentication → Sign In / Providers → Email**:
   - «Confirm email» activado (ya lo está).
   - «Secure email change» activado.
   - «Secure password change» activado.
   - **Minimum password length: 10**.
   - **Password requirements: «Letters and digits»**.
   - **Email OTP length: 6**. Hay proyectos nuevos que traen 8 por defecto.
   - Email OTP expiration: 3600 s, el valor por defecto.
4. **Authentication → Emails → Templates**:
   - **Confirm signup**:
     - Asunto: «Confirma tu email en ito». Sin el código en el asunto, que se ve en la pantalla bloqueada.
     - Cuerpo: «Tu código para confirmar tu email es **{{ .Token }}**. Caduca en 1 hora. También puedes pulsar este enlace: `<a href="{{ .ConfirmationURL }}">Confirmar mi email</a>`. Si no has creado una cuenta en ito, ignora este correo.»
   - **Reset password**:
     - Asunto: «Cambia tu contraseña de ito».
     - Cuerpo: «Tu código es **{{ .Token }}**. Caduca en 1 hora. Si no lo has pedido tú, ignora este correo.» Sin enlace.
5. **Authentication → Rate Limits**: revisar que siguen los valores por defecto. Con SMTP propio, ajustar el envío de emails a 30 por hora o menos.
6. **Cuentas de prueba** (Authentication → Users → Add user → Create new user, marcando «Auto Confirm User»): dos cuentas ficticias para las pruebas de web. Sirven para probar todo menos el email. Las contraseñas se guardan en un gestor de contraseñas, nunca en el repositorio ni en el chat.
7. **Al terminar el alta de David y María**: Authentication → Sign In / Providers → **desactivar «Allow new users to sign up»**. Si alguna vez hace falta otra cuenta, se crea desde el panel.
8. Aplicar la migración nueva (§5.3) cuando la apruebe.

---

## 8. Pantallas: estados, accesibilidad y textos

Siempre en segunda persona, con los colores de la especificación §3 y los patrones de §4 (botón principal granate de 52 px fijo en el pie; secundario `#EFEBE3`; X o chevron de 44 px con `accessibilityLabel`).

| Pantalla | Contenido y textos | Carga | Error | Vacío o particular |
|---|---|---|---|---|
| **Bienvenida** | Logotipo, «Dos vidas, un hilo.», «Los gastos, el calendario, los sitios y los viajes de los dos, en un solo sitio.», [Proveedores], **Usar mi email** y «Ya tengo cuenta» | — | — | Sin la línea de términos mientras no existan (§12) |
| **Crear cuenta** | «Crea tu cuenta», campos Email y Contraseña (+ Mostrar), ayuda «Al menos 8 caracteres, con letras y números», **Crear cuenta** | El botón muestra «Creando…» y queda desactivado | Línea bajo el campo afectado, anunciada al lector | — |
| **Verificar** | «Revisa tu correo», «Si el email no tenía cuenta, te hemos enviado un código de 6 cifras.», campo Código, «Reenviar código (0:59)», «¿Ya está confirmado? Entra» | «Comprobando…» | «El código no es válido o ha caducado. Pide uno nuevo.» | Se envía solo al completar 6 cifras |
| **Entrar** | Email, Contraseña, **Entrar**, «¿Has olvidado tu contraseña?» | «Entrando…» | Tabla de §3.3; tras 5 fallos, «Espera 30 s» | — |
| **Recuperar / Nueva contraseña** | «Te enviaremos un código para cambiar tu contraseña.» / «Elige una contraseña nueva» | ídem | ídem | — |
| **Crear o unirse** (1 de 4) | «Vuestro espacio», «Un sitio compartido donde viviréis los dos. ¿Cómo empezáis?», tarjetas «Crear nuestro espacio · Empiezo yo, invitaré a mi pareja» y «Tengo un código · Mi pareja ya me ha invitado» | La tarjeta pulsada muestra un indicador y las dos quedan desactivadas | «No se ha podido crear vuestro espacio. Inténtalo de nuevo.» | — |
| **Unirse** | «Únete a tu pareja», «Introduce el código que te ha enviado.», campo «Código de invitación» (se ve como `4K7·Q2X`; mayúsculas, sin autocorrector, se puede pegar), **BotonNudo «Unirme»** (`labelHecho`: «Ya estáis unidos», `labelError`: «No se ha podido unir») | El nudo espera abierto | El nudo se suelta y aparece el texto de §4.2 bajo el campo | Botón desactivado hasta tener 6 caracteres válidos |
| **Tu perfil** (2 de 4) | «¿Cómo te llamas?», avatar de 112 px con «Añadir foto», «Tu nombre» («Así te verá tu pareja en la app.»), «Tu color» con nombre del color en su tinta, «Tu pareja no podrá elegir el mismo color.», **BotonNudo «Continuar»**. Para quien se une, cabecera «David te ha invitado» y tarjeta «David ha configurado: reparto a medias · sin bote común · Podrás proponer cambios en Ajustes.» | Subiendo la foto, el avatar muestra un indicador; el nudo espera | Foto: «No se ha podido subir la foto. Puedes seguir sin ella.»; color: «Ese color lo acaba de elegir tu pareja. Elige otro.» | Sin foto: la inicial (o «?» si aún no hay nombre) en el color elegido |
| **Invitar** (4 de 4) | «Invita a tu pareja», «Compárteles este código para que se una a vuestro espacio.», código grande, «Copiar código» → «Código copiado», «Compartir», avatares D ─ ? con el hilo, «Esperando a que tu pareja se una…», **Continuar sin esperar**, «El código caduca el 21 de noviembre.», «¿Te has equivocado? Tengo un código» | Esqueleto en el código | «No se ha podido cargar el código. Reintentar» | Caducado: «Este código ha caducado» + «Crear otro código». Al unirse la pareja (Realtime): «¡María se ha unido!» y se continúa |
| **Inicio** (pareja incompleta) | Tarjeta «Tu pareja aún no se ha unido» + «Ver código» → `pareja/invitar` | — | — | Desaparece en vivo al unirse |
| **Sin conexión** | «No hay conexión», «Necesitamos conexión para preparar tu espacio la primera vez.», **Reintentar** | — | — | — |

**Accesibilidad:**
- Todos los controles miden al menos 44×44.
- Roles: tarjetas de elección `button`; colores `radio` dentro de un `radiogroup`, con `accessibilityLabel` «Menta» y `accessibilityState` `checked` y `disabled` («Menta, lo usa David»).
- Los errores se anuncian con `AccessibilityInfo.announceForAccessibility` y además van en `accessibilityLiveRegion="polite"` en Android.
- El orden de foco sigue el orden visual. El teclado no tapa el pie: `KeyboardAvoidingView` o `react-native-keyboard-controller` si ya se usa.
- Se respeta «Reducir movimiento»: BotonNudo y SplashHilo ya lo hacen.
- La fuente escala hasta el doble sin cortar el código de invitación (`adjustsFontSizeToFit` en el código).

**Componentes nuevos** (`components/onboarding/`):
- `CampoTexto`
- `CampoCodigo` (OTP e invitación, con formato)
- `BotonPrincipal`
- `BotonSecundario`
- `PieFormulario`
- `IndicadorPaso` («2 de 4»)
- `TarjetaEleccion`
- `SelectorColor`
- `AvatarPersona` (inicial o foto; se reutilizará en toda la app)
- `MensajeError`

---

## 9. Orden de implementación

Cada paso termina con `npm run typecheck` y `npm run lint` en verde y con la prueba indicada.

| Paso | Qué | Archivos | Cómo se comprueba |
|---|---|---|---|
| 0 | Panel de Supabase (§7, puntos 1 a 6) y migración nueva si David la aprueba | — | Un registro de prueba con el email de David recibe la plantilla nueva con código |
| 1 | Registro seguro, errores y regla `no-console` | `lib/registro.ts`, `lib/auth/errores.ts`, `eslint.config.js` | Un `console.log` en `app/` hace fallar `npm run lint` |
| 2 | Almacén de sesión y PKCE | `lib/auth/almacenSesion.ts`, `lib/supabase.ts` | En Expo Go se entra (paso 4), se cierra la app del todo, se vuelve a abrir y se sigue dentro; borrar una parte de la sesión a mano lleva a Bienvenida sin que la app falle |
| 3 | `SesionProvider`, fases mínimas (`cargando`, `sin_sesion`, `lista`) y `Stack.Protected` en la raíz, con Bienvenida provisional | `lib/auth/SesionProvider.tsx`, `app/_layout.tsx`, `app/(auth)/_layout.tsx`, `app/(auth)/bienvenida.tsx` | En web, sin sesión, `/` lleva a `/bienvenida` sin mostrar las pestañas ni un fotograma; `/gastos` también redirige |
| 4 | Crear cuenta, Verificar, Entrar, Recuperar y Nueva contraseña | `app/(auth)/*.tsx`, `lib/auth/acciones.ts`, `components/onboarding/Campo*.tsx`, `Boton*.tsx`, `PieFormulario.tsx`, `MensajeError.tsx` | En web, con el email de David: alta → código → dentro. Alta repetida con el mismo email: mismo mensaje. Contraseña mala: mensaje neutro. Confirmar `type: 'email'` frente a `'signup'` y que `email_not_confirmed` solo sale con la contraseña correcta |
| 5 | Enlace del email | `app/auth/callback.tsx`, `lib/auth/enlaces.ts` | En web, pulsar el enlace del correo → dentro y la URL limpia. En otra ventana privada: «Tu email está confirmado. Entra con tu contraseña.» En Expo Go: comprobar a mano si el móvil abre `exp://` |
| 6 | `EstadoProvider` con todas las fases, caché de fase, Crear o unirse y Unirse | `lib/pareja/EstadoProvider.tsx`, `lib/pareja/acciones.ts`, `lib/pareja/codigo.ts`, `app/(onboarding)/_layout.tsx`, `pareja.tsx`, `unirse.tsx`, `components/onboarding/TarjetaEleccion.tsx`, `IndicadorPaso.tsx` | Dos ventanas (§10): David crea; María, con un código inventado, ve «Ese código no existe…» |
| 7 | Tu perfil sin foto y colores | `app/(onboarding)/perfil.tsx`, `components/onboarding/SelectorColor.tsx`, `AvatarPersona.tsx`, `constants/theme.ts`, `components/hilo/HiloSaldar.tsx` | David elige menta → fase `invitar`. María se une y ve menta desactivado «Lo usa David», con lavanda preseleccionado |
| 8 | Invitar, Realtime, «Continuar sin esperar», tarjeta de Inicio y `pareja/invitar` | `app/(onboarding)/invitar.tsx`, `app/pareja/invitar.tsx`, `components/onboarding/PantallaInvitar.tsx`, `app/(tabs)/index.tsx` | Ventana de David en Invitar; María se une en la otra → David ve «¡María se ha unido!» sin recargar |
| 9 | Foto | `lib/avatar.ts`, `app.json` (plugin) | En Storage aparece `avatars/<uuid de David>/<uuid>.jpg` de 512 px y sin EXIF. María la ve; una tercera cuenta no puede firmarla (error) |
| 10 | Splash con `destino` y fase `sin_conexion` | `components/hilo/SplashHilo.tsx`, `components/hilo/splashCoreografia.ts`, `app/_layout.tsx`, `app/sin-conexion.tsx` | Arranque en frío en cada fase (sin sesión, sin pareja, lista): el hilo acaba bien y no hay saltos. Modo avión con caché → pestañas; sin caché → «No hay conexión» |
| 11 | Cerrar sesión y limpieza | `lib/auth/acciones.ts` y un botón provisional | Cerrar sesión → Bienvenida; al entrar con la otra cuenta en el mismo navegador no queda nada de la anterior (ni avatar ni fase) |
| 12 | Revisión de seguridad del arquitecto | — | Buscar `console.`, `params` con datos sensibles, `message` de errores en la interfaz y URLs firmadas persistidas |

---

## 10. Pruebas en web con dos cuentas

- **Dos sesiones a la vez**: ventana normal (David) y ventana privada (María). Cada una tiene su propio `localStorage`. Otra opción es usar dos perfiles del navegador.
- **Cuentas**: las dos de prueba con confirmación automática (§7.6), para el flujo de pareja. Para probar el email, la de David (miembro del equipo, válida aunque no haya SMTP propio, con el límite de 2 por hora) o cualquiera una vez configurado el SMTP propio.
- **Tercera cuenta de prueba** para «Ese espacio ya está completo».

**Casos:**
1. Alta nueva, alta repetida y entrada con la contraseña mala: los mensajes no distinguen si el email existe.
2. Código OTP caducado o erróneo, y «Reenviar» con su espera.
3. Código de invitación inventado, usado, caducado (forzar `expires_at` en el editor SQL), espacio lleno y 11 intentos en una hora.
4. Los dos eligen el mismo color a la vez.
5. David se equivoca y usa «Tengo un código».
6. Recargar la página en cada fase: no hay parpadeo y se vuelve a la misma pantalla.
7. Cerrar sesión y entrar con la otra cuenta en la misma ventana.
8. Comprobar en DevTools que la URL, la consola y el `localStorage` (salvo la sesión de Supabase) no contienen el email ni el código.

**En móvil (Expo Go)**: los pasos 2, 5, 9 y 10. Comprobar SecureStore, el selector de fotos y el enlace `exp://`.

---

## 11. Riesgos

1. **Entrega del email**: sin SMTP propio, María no recibe nada. Es lo primero que hay que resolver.
2. **El enlace en Expo Go no es fiable**: depende de la IP y de que el navegador salte a `exp://`. Por eso el código es el camino principal. El atajo se garantiza en web y en una build con `ito://`.
3. **Escáneres de enlaces** del correo que consumen el token. Mitigado: el email queda confirmado y se entra con contraseña.
4. **Detalles de Supabase por verificar en el paso 4**:
   - `type: 'email'` frente a `'signup'` en `verifyOtp`;
   - la longitud del OTP;
   - que `email_not_confirmed` no se devuelva con una contraseña mala.
5. **Adaptador de SecureStore propio**: un fallo lleva a cerrar la sesión, no a perder datos, porque falla cerrado. Hay que probar el arranque en frío en Android e iOS.
6. **Coordinación del splash con la guarda**: es lo más delicado visualmente. Se aísla en el paso 10 para no bloquear lo funcional.
7. **Hueco m2 bloqueado** si alguien sale (§5.2 punto 2). No afecta al primer uso, pero conviene decidirlo antes de usar la app en serio.

---

## 12. Decisiones que solo puede tomar David

1. **Migración nueva**: ¿aplicar la parte A (endurecimiento) y la parte B (volver a tu hueco si sales)?
2. **Unirse sin vista previa**: ¿aceptas que «David te ha invitado» y su configuración se vean justo después de pulsar «Unirme» (recomendado) y no antes, como en el mockup?
3. **SMTP**: ¿qué proveedor y qué dirección remitente? (Recomendado: Brevo gratuito con tu dirección verificada.) ¿O prefieres crear la cuenta de María desde el panel con confirmación automática y que ella solo cambie la contraseña?
4. **Cerrar el registro** de usuarios nuevos cuando estéis los dos dentro (recomendado).
5. **Paso «Cómo os organizáis el dinero»**: ¿entra ya o después? Mientras no exista, el espacio arranca a medias y sin bote, y se cambia en Ajustes.
6. **Términos y privacidad** en Bienvenida: ¿se quita la línea mientras no haya documentos? (Recomendado: sí.)
7. **Cerrar sesión** solo en este dispositivo por defecto (recomendado) y la opción de todos los dispositivos en Ajustes.
8. **Renombrar las claves de `personColors` al español** (recomendado), aunque toque `HiloSaldar.tsx`.
