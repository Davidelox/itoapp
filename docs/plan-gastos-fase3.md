# ito · Plan de Gastos, fase 3: bote común

> Estado: **borrador para revisar con David** (17 nov 2026).
> Alcance: pantalla **Bote común**: saldo, próxima aportación, reparto de la aportación, **aportar a mano**, **«el bote te debe X €»** con **reembolsar**, y movimientos del mes (aportaciones, reembolsos y gastos del bote por categoría). Pedir borrar un movimiento hecho a mano.
> **Fuera**: cambiar la aportación o activar y desactivar el bote (va con **Ajustes** y las propuestas de cambio), pagos recurrentes (fase 4).
> Mockup: `Bote` en [ito – Mockups](https://claude.ai/artifact/Ld49n1bZM5JJwyw6o4BbJU).

---

## 1. Lo que ya hace la base de datos

| Pieza | Qué hace |
|---|---|
| `pot_movements` | `contribution` (persona → bote), `reimbursement` (bote → persona), `adjustment` (con signo, para cuadrar con el banco). `is_auto` + `period` en las automáticas |
| `get_balance()` | `pot_balance_cents` = aportaciones + ajustes − reembolsos − gastos pagados por el bote. `pot_owes_me_cents` / `pot_owes_partner_cents` = lo que cada uno adelantó en gastos «del bote» − lo que se le ha reembolsado |
| `private.run_daily_jobs()` | Crea **una aportación automática por persona y mes** el día elegido (29–31 → último día del mes), desde `pot_started_on`. Idempotente |
| RLS | Los dos ven y apuntan movimientos; las automáticas solo las crea el job. Borrar un movimiento pide aprobación (`request_deletion('pot_movement', …)`) |

**Cosas que comprobar en Supabase** (§7): que **pg_cron** está activado y el job `ito-daily` programado. El esquema inicial solo lo programó si pg_cron ya estaba activo al ejecutarlo. Sin él, **no habrá aportaciones automáticas**.

---

## 2. Pantalla Bote común (mockup `Bote`)

**Entrada**: tocar la tarjeta del bote en Gastos (ahora con flecha) o su botón **Aportar**.

1. **Saldo**: «412,00 €», en negativo si el bote ha pagado más de lo que tenía («El bote está en negativo: aportad para cuadrarlo»).
   - «Próxima aportación: 1 dic · 1.000 €», calculada con los ajustes (mismo ajuste de día 29–31 que el servidor).
   - Si el relleno es a mano: «Se rellena a mano».
2. **Aportación automática** (solo si es mensual): «1.000 €/mes el día 1» y una barra por persona: «Tú 600 € · 60 %» / «Meri 400 € · 40 %», con el mismo redondeo que el job (`round(importe × % / 100)` para m1, el resto para m2). «Cambiar» no aparece hasta que exista Ajustes.
3. **Aportar ahora** → hoja inferior:
   - **Quién aporta**: Tú / {Pareja};
   - **Importe**;
   - **Confirmar aportación** → movimiento `contribution` (id generado en la app, para que reintentar no duplique).
4. **El bote te debe / le debe**, una tarjeta por persona con deuda:
   - «El bote te debe **54,30 €**» o «El bote debe 54,30 € a **Meri**»;
   - **Reembolsar desde el bote** → hoja con el importe (por defecto, todo; se puede poner menos, nunca más) → movimiento `reimbursement`;
   - después: «Reembolsados 54,30 € a Meri desde el bote».
5. **Movimientos del mes** (con flechas para ir a meses anteriores):
   - aportaciones (automáticas y a mano: «Aportación de Meri»), reembolsos y ajustes, con su signo;
   - **Gastos del bote**: total del mes y barras por categoría (Súper, Hogar, Suscripciones…);
   - al tocar un movimiento hecho a mano: detalle con **Pedir borrar** (con aprobación de la otra persona, como los gastos). Las automáticas no se borran.

**En Gastos**: la tarjeta del bote pasa a enseñar saldo, próxima aportación y, si la hay, «El bote te debe 54,30 €». Se puede tocar.

**En Inicio**: la tarjeta «Meri quiere borrar «Aportación de Meri · 300,00 €»» usa lo mismo que los gastos.

---

## 3. Código

| Archivo | Qué |
|---|---|
| `lib/gastos/bote.ts` | Funciones puras con pruebas: próxima aportación (día 29–31, mes siguiente, `pot_started_on`), reparto de la aportación, deudas del bote vistas desde quien mira, resumen del mes por categoría y textos |
| `lib/gastos/consultas.ts` | `leerBote` (ajustes + movimientos del mes + gastos del bote del mes), `aportar`, `reembolsar` |
| `lib/gastos/useGastos.ts` | Hooks; el canal de tiempo real escucha también `pot_movements` |
| `app/gastos/bote.tsx` | Pantalla del bote con sus dos hojas (aportar y reembolsar) |
| `app/gastos/movimiento/[id].tsx` | Detalle de un movimiento con pedir borrar |
| `components/gastos/TarjetaSaldo.tsx`, `TarjetasPendientes.tsx` | Tarjeta del bote ampliada; tarjeta de Inicio para borrar movimientos |

---

## 4. Orden y comprobación

| Paso | Qué | Cómo se comprueba |
|---|---|---|
| 1 | `bote.ts` con pruebas | Próxima aportación el 31 en febrero → 28/29; reparto 1.000 € al 60 % → 600/400; 333,33 € al 50 % → 166,67/166,66 |
| 2 | Consultas, hooks y tiempo real | — |
| 3 | Pantalla del bote y aportar | Meri aporta 300 € → el saldo sube en las dos cuentas sin recargar |
| 4 | Deuda y reembolso | David apunta «Súper 54,30 €, pagaste tú, del bote» → «El bote te debe 54,30 €» → Reembolsar → saldo −54,30 y la deuda desaparece |
| 5 | Movimientos del mes y por categoría | Los totales coinciden con Supabase |
| 6 | Pedir borrar un movimiento | Meri aprueba en Inicio → desaparece y el saldo vuelve |
| 7 | Aportación automática | Tras activar pg_cron, ejecutar el job a mano (§7) → aparece «Aportación automática» de cada uno |
| 8 | Revisión del arquitecto | Signos, redondeo, permisos |

---

## 5. Un agujero en la base de datos

La política `pot_movements_update` deja a **cualquiera de los dos cambiar el importe de cualquier movimiento**, incluidas las aportaciones automáticas, **sin aprobación**. Por ejemplo, convertir una aportación de 1.000 € en 1 €. Borrar sí pide aprobación, así que esto se la salta. La app no va a editar movimientos, pero la API lo permite.

**Propuesta**: una migración pequeña que quite esa política (o la limite a la nota). Para corregir un importe: pedir borrar y volver a apuntarlo.

---

## 6. Decisiones que solo puede tomar David

1. **Quitar la edición de movimientos del bote** (§5). (Recomendado: sí, con una migración pequeña.)
2. **Reembolsos parciales**: poder reembolsar menos de lo que el bote debe. (Recomendado: sí; nunca más de lo que debe.)
3. **Ajustes manuales** («cuadrar con el banco», con signo): ¿en esta fase o más adelante? (Recomendado: más adelante, en Ajustes; el mockup no los tiene.)
4. **Revisión del arquitecto** al terminar. (Recomendado: sí.)

---

## 7. Lo que tiene que hacer David en Supabase

1. **Database → Extensions → pg_cron**: activarlo si no lo está.
2. En el SQL Editor, comprobar los jobs:
   ```sql
   select jobname, schedule, active from cron.job;
   ```
   Tienen que aparecer `ito-daily` (05:15) e `ito-limpieza`. Si no aparecen, vuelve a ejecutar el final del esquema inicial (§15) y de la migración de onboarding, o pídeme el SQL exacto.
3. Para probar sin esperar al día de la aportación: `select private.run_daily_jobs();`

---

## 8. Revisión del arquitecto (17 nov) y notas para Ajustes

**Corregido en esta fase:**
- **Reembolsos validados en el servidor** (C1). La migración `20261117020000` añade `reimburse_from_pot`, que serializa los reembolsos de la pareja, nunca deja pasar más de lo que el bote debe y es idempotente. Además, el cliente ya solo puede insertar aportaciones. La app usa el máximo en vivo.
- **Aportación reintentada con otros datos** (I1): ahora avisa en vez de dar por buenos datos que no se han guardado.
- **Deuda del bote en negativo** (I2): ahora se explica en pantalla.
- **Hoja bloqueada mientras guarda** (I3).
- **Menores:**
  - aviso de aportación retrasada (M1);
  - la próxima aportación ya no tiene tope de meses (M2);
  - sin pareja no se puede aportar en su nombre (M5);
  - pruebas nuevas (M9).

**A tener en cuenta en la pantalla de Ajustes:**
- **I4 · Aportaciones retroactivas.** Al reactivar el bote o pasar de relleno manual a mensual, `respond_settings_proposal` tiene que forzar `pot_started_on := greatest(propuesto, hoy en la zona de la pareja)`. Si no, el job creará de golpe las aportaciones de los meses en que estuvo apagado.
- **M3 · Zona horaria.** La app usa la fecha del dispositivo y el job la zona de la pareja (`couples.time_zone`). Hay que unificarlo.
- **M6 · Bote desactivado.** Al desactivarlo no deben desaparecer el saldo ni las deudas pendientes: hay que poder reembolsarlas.
- **M8 · Versión de los ajustes.** El job sube `couple_settings.version` cada mes. Si Ajustes usa control de versión, saldrán conflictos falsos.
