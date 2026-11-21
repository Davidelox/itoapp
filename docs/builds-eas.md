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
