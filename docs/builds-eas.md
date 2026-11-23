# Builds con EAS (development build)

Con `expo-dev-client` ya no se usa Expo Go: la app se instala como build propia (bundle `com.davidelox.ito`).

## Pasos (David)
1. `npm i -g eas-cli` (o `npx eas-cli ...`).
2. `eas login` (cuenta de expo.dev).
3. `eas init`: crea el proyecto y escribe `extra.eas.projectId` en `app.json`.
4. Variables públicas (valores en `.env`, no en git), una por entorno (`development`, `preview`, `production`):
   `eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value <url> --environment development --visibility plaintext`
   `eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon> --environment development --visibility plaintext`
   (repetir con `preview` y `production`). `eas.json` ya enlaza cada perfil con su entorno.
   Nunca `service_role`. `EXPO_PUBLIC_VISTA_PREVIA` es solo para desarrollo local: no se define.
5. `eas device:create`: genera enlace/QR; abrirlo en el iPhone de David y en el de María, instalar el perfil y activar Ajustes → Privacidad y seguridad → Modo desarrollador.
6. `eas build --profile development --platform ios`: EAS crea certificados, perfil de aprovisionamiento y clave APNs (pide Apple ID y doble factor). Elegir los dos dispositivos.
7. Instalar la build en los dos iPhone (enlace/QR al terminar).
8. `npx expo start --dev-client`.

## Después
- Poner `EXPO_ACCESS_TOKEN` (expo.dev → Access tokens) en los secretos de la Edge Function `enviar-avisos`; probar «Probar aviso» en Ajustes → Avisos.
- TestFlight: `eas build --profile production --platform ios` y `eas submit --platform ios`.
- Build sin servidor de desarrollo: `--profile preview`.
- Android necesitaría Firebase/FCM (`google-services.json`) para push.

## Build preview sin servidor y actualizaciones
Build `preview` (ad hoc, iPhone): lleva el código dentro, no necesita `expo start`, y recibe cambios por EAS Update en el canal `preview`.
`app.config.js` fija el entorno de APNs según `EAS_BUILD_PROFILE` (`development` → `development`; `preview` y `production` → `production`).
1. Variables de EAS para `preview` (una vez): `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   (`eas env:create --name <NOMBRE> --value <valor> --environment preview --visibility plaintext`). Nunca `service_role`.
2. `eas build --profile preview --platform ios` (los dispositivos ya registrados con `eas device:create`).
3. Instalar por el enlace/QR del final de la build en cada iPhone.
4. Cada cambio posterior de código: `eas update --channel preview --message "texto"`.
   El móvil lo descarga al abrir la app y se aplica en el siguiente arranque (hay que abrirla dos veces).
- Hace falta build nueva si cambia: una librería nativa, permisos, icono, nombre o la parte nativa de `app.json`/`app.config.js`.
  Entonces subir `version` en `app.json`: `runtimeVersion` usa la versión, así las actualizaciones nuevas no llegan a builds incompatibles.
- Migraciones de Supabase compatibles hacia atrás (solo añadir columnas/tablas/funciones; no borrar ni renombrar) mientras haya móviles sin actualizar.
- Volver a desarrollo: `eas build --profile development --platform ios` e instalarla: es la misma app (`com.davidelox.ito`) y reemplaza a la preview.
  Para usar el servidor: `npx expo start --dev-client`.
