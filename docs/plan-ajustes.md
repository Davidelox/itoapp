# ito · Plan de Ajustes

> Estado: **borrador para revisar con David** (17 nov 2026).
> Alcance: pantalla **Ajustes** con perfil (foto, nombre, color), pareja, dinero (reparto por defecto y %, bote sí/no, relleno, aportación, día y reparto de la aportación, categorías del modo mixto), privacidad, cuenta y **cerrar sesión** al final. Los cambios de dinero, cuando la pareja ya se ha unido, van por **propuesta que acepta la otra persona**.
> **Fuera**: avisos push (cuando existan las notificaciones), recurrentes (fase 4 de Gastos), moneda y zona horaria visibles.
> Viene de: `docs/revision-diseno.md` (A3) y las notas de la fase 3 (`plan-gastos-fase3.md` §8: I4, M3, M6 y M8).

---

## 1. Lo que ya hace la base de datos

| Pieza | Qué hace |
|---|---|
| `profiles` | `display_name` (≤ 40) y `avatar_path` (bucket `avatars`). Cada uno edita solo el suyo |
| `couple_members` | Mi `color` (único en la pareja), privacidad por defecto (`share_personal_expenses`, `share_personal_recurring`, `share_places`) y avisos (`notify_*`). Cada uno edita solo su fila |
| `couple_settings` | `default_split`, `proportional_pct_m1`, `pot_enabled`, `pot_categories`, `pot_funding`, `pot_monthly_cents`, `pot_day`, `pot_pct_m1`, `pot_started_on`. **Edición directa solo mientras estás solo en el espacio** |
| `settings_proposals` | Con la pareja unida: uno propone `changes` (solo las columnas que cambian) y la otra persona acepta o rechaza con `respond_settings_proposal`. **Solo una propuesta pendiente por pareja**. Quien propone puede retirarla |
| `pending_actions` | Ya incluye `settings_proposal` → tarjeta en Inicio |
| `leave_couple()` | Salir del espacio (ya usado por «Salir / Eliminar el espacio» en Inicio) |

**Lo que falta en el servidor** (§6): no hay forma de **borrar la cuenta**, y `respond_settings_proposal` no cubre las notas I4 y M6 de la fase 3.

---

## 2. Pantalla Ajustes

**Entrada**: los avatares de la cabecera de Inicio (hoy no llevan a nada). Es una página propia porque es larga; **cada cambio se edita en una hoja inferior**.

1. **Perfil** (arriba, tarjeta grande): foto, nombre y color. Al tocar → hoja **Editar perfil**:
   - foto (cambiar o quitar), nombre, selector de color con el de la pareja desactivado («Ocupado por Meri»);
   - se guarda al momento (es solo tuyo, sin aprobación). Reutiliza `guardarPerfil` y `SelectorColor` del onboarding.
2. **Pareja**:
   - unida: avatares de los dos, «Juntos en ito desde el 14 nov»;
   - sin unir: «Esperando a tu pareja» con el **código de invitación** (copiar / compartir / nuevo código), lo mismo que el paso Invitar.
3. **Dinero** (una fila por ajuste con su valor actual y chevrón; cada una abre su hoja):
   - **Reparto por defecto**: Mixto / Todo al bote / A medias / Proporcional. Si es proporcional, el **%** con el mismo control del onboarding («Tú 60 % · Meri 40 %»).
   - **Categorías del bote** (solo si es Mixto): las 9 categorías con un interruptor «Del bote / A repartir».
   - **Bote común**: Sí / No.
   - **Relleno del bote**: mensual o a mano; si es mensual, **importe** y **día** (29–31 → último día del mes).
   - **Cómo aportáis**: a medias o proporcional, con su %.
   - Con la pareja unida, el botón de cada hoja dice **Proponer cambio** y abajo «Meri tendrá que aceptarlo». Estando solo, **Guardar**.
4. **Privacidad**: «Mis gastos personales, visibles para Meri por defecto» (`share_personal_expenses`; el formulario de gasto ya lo usa como valor inicial). Solo tuyo, al momento.
5. **Cuenta**: email (solo lectura), **Cambiar contraseña** (reutiliza la pantalla de nueva contraseña), **Salir del espacio** (se mueve aquí desde Inicio, con la misma confirmación en hoja) y **Borrar mi cuenta** (§6, decisión 4).
6. **Cerrar sesión**, abajo del todo, y la versión de la app en pequeño. El botón de prueba de Inicio desaparece.

---

## 3. Propuestas de cambio

- Una propuesta agrupa **lo que cambias en esa hoja** (por ejemplo, importe y día del relleno juntos).
- **Quien propone** ve en Ajustes una banda «Has propuesto: aportación 1.000 € → 1.200 € · esperando a **Meri**» con **Retirar**. Mientras tanto, las filas de dinero se ven pero no se pueden proponer más cambios (el servidor solo admite una pendiente).
- **La otra persona** ve una tarjeta en Inicio (y la misma banda en Ajustes): «**David** propone cambiar la aportación al bote: 1.000 € → 1.200 € al mes» → **Aceptar** / **Rechazar**. Como las demás tarjetas, al responder se queda con su resultado.
- Si **la otra persona ya tiene una propuesta pendiente**, al intentar proponer: «Meri ya ha propuesto un cambio. Respóndelo primero».
- **Sin control de versión** en las propuestas: solo se aplican las columnas que cambian, así que el job mensual (que sube `version`) no provoca conflictos falsos (**M8**). El «antes» de la tarjeta se calcula con los ajustes actuales, no con los de cuando se propuso.
- Textos legibles para cada cambio (`lib/ajustes/textos.ts`, con pruebas): reparto, %, bote sí/no, relleno, importe, día, reparto de la aportación y categorías («Ocio pasa al bote»).

---

## 4. Reglas que la app tiene que respetar

- **Sin bote no hay Mixto ni Todo al bote** (CHECK del servidor). Desactivar el bote con uno de esos repartos propone a la vez «A medias» (se dice en la hoja).
- **Bote desactivado (M6)**: el saldo y las deudas del bote no desaparecen. La tarjeta del bote y su pantalla siguen visibles mientras el saldo o las deudas no sean 0, con «El bote está desactivado: reembolsad lo pendiente». Aportar se oculta; reembolsar sigue.
- **Aportaciones retroactivas (I4)**: al activar el bote o pasar a mensual, `pot_started_on` es **hoy en la zona de la pareja** como mínimo, para que el job no cree de golpe los meses en que estuvo apagado. Se impone en el servidor (§6), también en la edición directa.
- **Zona horaria (M3)**: los cálculos de fechas de la app (próxima aportación, «hoy») usan `couples.time_zone`, no la del móvil. Se guarda la del dispositivo al crear el espacio y no se muestra (decisión 5).

---

## 5. Código

| Archivo | Qué |
|---|---|
| `app/ajustes/index.tsx` | Pantalla Ajustes (página, `Stack` dentro del guard «lista»; también accesible sin pareja unida) |
| `components/ajustes/Hoja*.tsx` | Hojas: perfil, reparto, categorías, bote, relleno, aportación, salir, borrar cuenta |
| `lib/ajustes/textos.ts` | Diferencias legibles entre ajustes actuales y propuestos. **Con pruebas** |
| `lib/ajustes/consultas.ts` | `leerAjustesCompletos`, `proponer(id, cambios)` (id generado en la app), `responderPropuesta`, `retirarPropuesta`, `guardarPrivacidad` |
| `lib/gastos/useGastos.ts` | Hooks; el canal de tiempo real escucha también `settings_proposals`, `couple_settings`, `couple_members` y `profiles` |
| `components/inicio/TarjetasPendientes.tsx` | Tarjeta de propuesta |
| `app/(tabs)/index.tsx` | Avatares de la cabecera → Ajustes; quitar los botones de prueba |
| `lib/gastos/bote.ts`, `TarjetaSaldo.tsx`, `app/gastos/bote.tsx` | Bote desactivado con saldo (M6) y zona de la pareja (M3) |

---

## 6. Migración `20261118000000_ajustes.sql`

1. `respond_settings_proposal`: solo acepta las columnas de dinero conocidas (rechaza el resto con `TW030`); fuerza `pot_started_on := greatest(propuesto, hoy en la zona de la pareja)` al activar el bote o pasar a mensual (**I4**); si se desactiva el bote con Mixto o Todo al bote, error claro en vez del CHECK genérico.
2. Lo mismo de I4 en `settings_before_update`, para la edición directa estando solo.
3. **M6**: revisar que con el bote desactivado se pueda seguir reembolsando y que editar un gasto antiguo «del bote» no falle por `pot_enabled`.
4. **Borrar cuenta** (si decides que entre): una Edge Function `borrar-cuenta` con la clave `service_role` (solo en el servidor) que sale del espacio, borra la foto y borra el usuario de auth. Los gastos compartidos se quedan para la pareja con el nombre «Cuenta borrada».

---

## 7. Orden y comprobación

| Paso | Qué | Cómo se comprueba |
|---|---|---|
| 1 | `textos.ts` con pruebas | «1.000 € → 1.200 € al mes», «Ocio pasa al bote», desactivar bote + Mixto → A medias |
| 2 | Pantalla, perfil y privacidad | Cambiar foto, nombre y color → se ve en Gastos e Inicio de los dos; el color de la pareja sale desactivado |
| 3 | Dinero estando solo | Cambiar reparto y aportación → se guarda al momento |
| 4 | Propuestas | David propone 1.200 € → Meri ve la tarjeta → Acepta → cambia en los dos. Otra → Rechaza → se queda. Retirar |
| 5 | Migración y casos límite | Reactivar el bote con `pot_started_on` antiguo → el job no crea meses atrasados. Bote desactivado con deuda → se puede reembolsar |
| 6 | Cuenta y cerrar sesión | Cambiar contraseña; salir del espacio; cerrar sesión |
| 7 | Revisión del arquitecto | Permisos, propuestas, I4/M6 |

---

## 8. Decisiones que solo puede tomar David

1. **Entrada a Ajustes** desde los avatares de la cabecera de Inicio. (Recomendado: sí, como dice el concepto.)
2. **Categorías del bote en Mixto** dentro de Ajustes. (Recomendado: sí. Ahora Mixto usa Hogar, Súper y Suscripciones sin que se pueda cambiar.)
3. **Privacidad por defecto** de los gastos personales. (Recomendado: sí; ya existe en la base de datos.)
4. **Borrar mi cuenta** en esta fase (Apple la exige para publicar en la App Store). (Recomendado: sí, con la Edge Function; si no, «Próximamente».)
5. **Zona horaria de la pareja** para todos los cálculos de fechas, sin mostrarla. (Recomendado: sí.)
6. **Avisos** en Ajustes: ¿ahora como interruptores sin efecto, o cuando existan las notificaciones push? (Recomendado: cuando existan.)
7. **Revisión del arquitecto** al terminar. (Recomendado: sí.)
