# Plan: inicio de sesión con Apple y Google

Decidido: Apple + Google + email, con `signInWithIdToken` (token nativo, sin navegador). Solo iOS por ahora; en Android y web no se muestran los botones. Sin migraciones ni cambios de RLS: `private.handle_new_user` ya crea el perfil y copia `full_name`/`name` (Google los trae).

**No hay nada que bloquee.** Las fases 0 y 4 dependen de David. **Requiere build nativa nueva**: con `runtimeVersion: appVersion`, subir `version` a `1.1.0`; si no, un EAS Update con estos módulos llegaría a las builds 1.0.0, que no los tienen, y la app se cerraría al arrancar.

## Fase 0 · Consolas (David, en este orden)

1. **Apple Developer** → Certificates, IDs & Profiles:
   - Identifiers → `com.davidelox.ito` → marcar **Sign in with Apple** («Enable as a primary App ID») → Save. (EAS también lo activa solo al compilar; basta con comprobarlo).
   - Keys → **+** → nombre `ito Sign in with Apple` → marcar **Sign in with Apple** → Configure → Primary App ID `com.davidelox.ito` → Save → Continue → Register → **Download** `AuthKey_<KEYID>.p8` (solo se descarga una vez). Apuntar el **Key ID** (10 caracteres). Guardar el `.p8` **fuera del repo** (gestor de contraseñas). Solo sirve para revocar el acceso al borrar la cuenta.
   - **No hace falta Services ID** ni dominio de retorno: solo sirven para el login web de Apple.
2. **Google Cloud Console** (proyecto nuevo `ito`):
   - Google Auth Platform → Branding: nombre `ito`, email de soporte y de contacto de David. Audience: **External**, estado **Testing**, test users: los Gmail de David y María (antes de publicar en tienda, pasar a «In production»; con `openid`, `email` y `profile` no piden verificación).
   - Clients → Create client → **iOS** → nombre `ito iOS` → Bundle ID `com.davidelox.ito` → Team ID `ZZJ3GQ7KL8` → Create. Apuntar el **Client ID** (`…apps.googleusercontent.com`) y el **iOS URL scheme** (`com.googleusercontent.apps.…`).
   - Clients → Create client → **Web application** → nombre `ito Supabase` → sin orígenes ni redirecciones → Create. Apuntar su **Client ID** (el secreto solo se usa si el panel de Supabase lo exige).
3. **Supabase** → Authentication → Sign In / Providers:
   - **Apple**: Enable. Client IDs: `com.davidelox.ito`. Secret Key: vacío (solo hace falta para OAuth web; así no hay que renovarlo cada 6 meses).
   - **Google**: Enable. Client IDs: `<WEB_CLIENT_ID>,<IOS_CLIENT_ID>` (el web primero, separados por coma, sin espacios). **Skip nonce checks: activado** (ver Seguridad). Secreto: vacío, o el del cliente web si el panel no deja guardar sin él.
   - Manual linking: dejarlo **desactivado**.
4. Pasar a Claude el Key ID, los dos Client ID y el URL scheme (no son secretos) y la ruta local del `.p8`. Con el sí de David se ejecutan:
   - `supabase secrets set APPLE_TEAM_ID=ZZJ3GQ7KL8 APPLE_CLIENT_ID=com.davidelox.ito APPLE_KEY_ID=<KEYID>`
   - `supabase secrets set APPLE_PRIVATE_KEY="$(cat <ruta>/AuthKey_<KEYID>.p8)"`
   - `eas env:create --environment development|preview|production --visibility plaintext` con `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` y `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (las tres variantes), y las dos variables en `.env` local.

## Fase 1 · Apple

1. `npx expo install expo-apple-authentication` → `package.json`.
2. `app.json`: plugin `"expo-apple-authentication"`, `ios.usesAppleSignIn: true` (añade el entitlement `com.apple.developer.applesignin`) y `version: "1.1.0"`.
3. `lib/auth/proveedores.ts`:
   - `PROVEEDORES_SOCIALES` = `['apple', 'google']` solo si `Platform.OS === 'ios'`; Apple además con `AppleAuthentication.isAvailableAsync()`.
   - `entrarConApple()`: nonce crudo de 32 bytes aleatorios (`expo-crypto`, ya instalado) → `signInAsync({ requestedScopes: [FULL_NAME, EMAIL], nonce: sha256Hex(crudo) })` → `supabase.auth.signInWithIdToken({ provider: 'apple', token: identityToken, nonce: crudo })`.
   - Nombre: Apple solo lo da la primera vez. Si llega `fullName.givenName`, `update profiles set display_name = <givenName, máx. 40> where id = uid and display_name = ''` (la RLS `profiles_update` ya lo permite). Si falla, no pasa nada: la pantalla Perfil pide el nombre igualmente (fase `sin_perfil`).
   - Cancelar (`ERR_REQUEST_CANCELED`) devuelve `{ ok: false, mensaje: '' }` y no se pinta error. El resto, con `traducirErrorAuth`.
4. `app/(auth)/bienvenida.tsx`: Apple con `AppleAuthenticationButton` oficial (estilo BLACK, `cornerRadius` 26, alto 52), **el primero**; Google debajo, con el logo «G» según las normas de marca de Google; después «Usar mi email». Estado de carga y `flujo.limpiar()` al entrar bien (como en `entrar.tsx`). La guarda de fases hace el resto: una cuenta nueva va a `sin_pareja` → crear o unirse → Perfil → …; una cuenta enlazada a la de email entra en su espacio.
5. `lib/auth/errores.ts`: nada nuevo salvo que haga falta un texto para «Apple no disponible en este dispositivo».

## Fase 2 · Google

1. `npx expo install @react-native-google-signin/google-signin` (versión gratuita).
2. `app.json`: plugin `["@react-native-google-signin/google-signin", { "iosUrlScheme": "com.googleusercontent.apps.<…>" }]` (sin Firebase).
3. `lib/auth/proveedores.ts`: `GoogleSignin.configure({ iosClientId, webClientId })` una vez, con las variables `EXPO_PUBLIC_GOOGLE_*`. `entrarConGoogle()`: `signIn()` → si la respuesta es `cancelled`, salir sin error → `signInWithIdToken({ provider: 'google', token: data.idToken })`. Sin `access_token` ni `getTokens()`.
4. `lib/auth/acciones.ts` `cerrarSesion`: `GoogleSignin.signOut()` (con `catch`, sin bloquear) para que la próxima vez se pueda elegir otra cuenta y no se reutilice un token en caché.
5. `.env.example`: las dos variables nuevas.

## Fase 3 · Ajustes y borrar cuenta (revisión con Opus: auth, Edge Function, borrado)

1. `app/ajustes/index.tsx`: leer `session.user.app_metadata.providers`.
   - «Cambiar contraseña» solo si incluye `email`.
   - Email que acaba en `@privaterelay.appleid.com`: mostrar «Oculto con Apple».
2. `components/ajustes/HojasCuenta.tsx` `HojaBorrarCuenta`: si `providers` incluye `apple`, antes de borrar se llama a `AppleAuthentication.signInAsync()` (Face ID, sin scopes) para obtener un `authorizationCode` nuevo; si se cancela, no se borra. Se llama a la función justo después (el código caduca a los 5 min y es de un solo uso).
3. `lib/ajustes/consultas.ts` `borrarCuenta(codigoApple?)`: lo envía en el cuerpo `{ codigoApple }`. El error `apple_reautenticar` se traduce como «Vuelve a confirmar con Apple».
4. `supabase/functions/borrar-cuenta/index.ts`: revocar **antes** del paso 1 (`leave_couple`), para que un fallo no deje nada a medias.
   - Con `datos.user.identities` (servidor, no lo que diga el cliente): si hay identidad `apple` y no llega `codigoApple` → 400 `apple_reautenticar`.
   - `client_secret`: JWT ES256 firmado con `APPLE_PRIVATE_KEY` (`npm:jose`, `importPKCS8`). Cabecera `kid = APPLE_KEY_ID`. Cuerpo: `iss = APPLE_TEAM_ID`, `sub = APPLE_CLIENT_ID`, `aud = https://appleid.apple.com`, `exp = ahora + 5 min`. Se genera en cada llamada, así no caduca nada.
   - `POST https://appleid.apple.com/auth/token` (form: `client_id`, `client_secret`, `code`, `grant_type=authorization_code`). Si `invalid_grant` → 400 `apple_reautenticar`.
   - Decodificar el `id_token` de la respuesta (viene directo de Apple por TLS) y exigir `sub` igual al `identity_data.sub` de la identidad `apple` del usuario; si no coincide → 403 sin borrar nada.
   - `POST https://appleid.apple.com/auth/revoke` (form: `client_id`, `client_secret`, `token = refresh_token`, `token_type_hint=refresh_token`). Si no da 200 → 502 `apple_revocar`, sin borrar; la app dice «No hemos podido desconectar Apple. Inténtalo de nuevo».
   - Después, los pasos actuales sin cambios. Nunca registrar el código ni los tokens: solo el estado HTTP.
   - Desplegar con `supabase functions deploy borrar-cuenta`, tras el sí de David.

## Fase 4 · Builds y pruebas (David)

- Local: `npx expo prebuild --clean` antes de `expo run:ios` (la carpeta `ios/` local no tiene los plugins nuevos). EAS la genera sola.
- `eas build -p ios --profile development` y después `preview`; EAS actualiza los perfiles de aprovisionamiento con la capability nueva. Las builds 1.0.0 dejan de recibir updates: instalar la nueva en los dos iPhone.
- Lista de pruebas:
  1. Apple con email compartido sobre la cuenta de email existente de David: entra en su espacio (se enlaza solo).
  2. Apple con «Ocultar mi email»: cuenta nueva y vacía (ver Decisiones).
  3. Google con el Gmail de una cuenta existente: se enlaza solo.
  4. Cuenta nueva: crear o unirse a un espacio; Perfil con el nombre ya puesto.
  5. Cerrar sesión y volver a entrar con los dos proveedores; cancelar cada hoja sin que salga error.
  6. Borrar una cuenta de prueba de Apple: en Ajustes del iPhone → Apple ID → Iniciar sesión con Apple, ito desaparece; al volver a entrar, Apple pide de nuevo el nombre.

## Seguridad

- **Nonce**: Apple con nonce (crudo a Supabase, hash SHA-256 a Apple). Google: la versión gratuita de la librería no deja pasar nonce en iOS, así que hay que activar «Skip nonce checks» (solo en Google). Riesgo residual: reutilizar un ID token de Google robado durante su hora de vida, y solo con audiencia de ito. Se acepta para dos usuarios. La alternativa es la versión de pago de la librería («Universal Sign-In»), que sí pasa nonce.
- **Audiencias**: Supabase valida `aud` contra «Client IDs». Solo `com.davidelox.ito` (Apple) y los dos clientes de ito (Google); ningún otro.
- **Sin tokens guardados**: `identityToken`, `authorizationCode` e `idToken` solo en memoria; nunca a `registrarError`, a AsyncStorage ni a la base de datos. La sesión de Supabase sigue en el Keychain (`almacenSesion`). La revocación no guarda el refresh token de Apple: se pide un código nuevo al borrar.
- **Enlazado de cuentas**: Supabase enlaza solo si el email es el mismo y está verificado (Apple y Google lo verifican). Con «Ocultar mi email» el email es distinto y sale otra cuenta. El enlazado manual (`linkIdentity`) queda desactivado.
- **`.p8`**: solo como secreto de la Edge Function (`*.p8` ya está en `.gitignore`). Si se filtra, revocar la clave en Apple Developer y crear otra.
- **RLS/migraciones**: sin cambios.

## Riesgos

- Un EAS Update sin subir `version` rompe las builds 1.0.0 (ver arriba).
- Caché de Google en iOS: puede devolver otra cuenta. Lo evita el `signOut()` al cerrar sesión.
- Emails a direcciones `privaterelay` (recuperar contraseña): Apple los descarta si el remitente no está registrado en «Sign in with Apple for Email Communication». Hoy da igual (las cuentas de Apple no tienen contraseña); revisarlo al montar el SMTP propio.
- App Review: botón oficial de Apple, al menos igual de visible que el de Google; la cuenta demo sigue siendo de email.

## Decisiones de David

1. Aceptar «Skip nonce checks» en Google (recomendado) o pagar la versión con nonce.
2. Las cuentas de David y María ya existen con email. Con Google, o con Apple compartiendo el email, se enlazan solas. Con «Ocultar mi email» se crearía otra cuenta vacía: no usar esa opción con vuestras cuentas actuales.
