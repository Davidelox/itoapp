# ito · Plan de Gastos, fase 4: pagos recurrentes

> Estado: **borrador para revisar con David** (17 nov 2026).
> Alcance: lista **Pagos recurrentes** (compartidos y personales), **crear y editar** un recurrente (fijo o variable; una vez, cada mes o cada año), **pausar**, **pedir borrar**, el gasto que se crea solo en cada cobro y la tarjeta de Inicio **«Ha llegado la luz: pon el importe»** para los variables.
> **Fuera**: avisos push antes de cada cobro (se guardan, llegarán con las notificaciones) y pagos en la pestaña Calendario (ya los calcula `calendar_range`; se verán cuando exista Calendario).
> Mockups: `Recurrentes` y `NuevoPago` en [ito – Mockups](https://claude.ai/artifact/Ld49n1bZM5JJwyw6o4BbJU). El mockup `Ajustes` tiene también «Pagos recurrentes personales» en la privacidad.

---

## 1. Lo que ya hace la base de datos

| Pieza | Qué hace |
|---|---|
| `recurring_payments` | Nombre, categoría (por defecto Suscripciones), importe (aproximado si `is_variable`), `frequency` `once` / `monthly` / `yearly`, `day_of_month`, `month_of_year`, `start_date` (en `once`, la fecha del cobro), `end_date`, `paused`, `paid_by`, `split_mode` + `split_pct_m1` (lo mismo que un gasto), `reminder_days` (0, 1, 3 o null), `visible_to_partner`, `show_in_calendar` |
| `recurring_occurrences` | Un cobro concreto. Lo crea el job el día que vence. `pending` = falta el importe real, `paid` = ya tiene gasto, `skipped` = ese mes no se paga |
| Job diario (`run_daily_jobs`, paso 2) | Por cada recurrente no pausado y cada cobro vencido (como mucho 31 días atrás y nunca antes de que se creara): crea el cobro y, **si el importe es fijo, crea el gasto** con su reparto. Si es variable, el cobro queda pendiente |
| Trigger de gastos | Un gasto con `recurring_occurrence_id` marca su cobro como pagado con el importe real; si se borra, el cobro vuelve a pendiente |
| `pending_actions` | `variable_amount`: cobros variables pendientes → tarjeta de Inicio |
| `request_deletion('recurring_payment', …)` | Uno privado se borra al momento; uno compartido necesita la aprobación de la otra persona. Borrarlo no borra los gastos ya creados |
| RLS | Los dos ven y **editan** los recurrentes compartidos sin aprobación (como los gastos); los privados solo quien los creó |

---

## 2. Pantallas

### Pagos recurrentes (mockup `Recurrentes`)

**Entrada**: en Gastos, una tarjeta **Pagos recurrentes** debajo de la del bote: «113,98 € al mes · próximo: Netflix, lun 16» (decisión 1).

1. Cabecera con volver y **+** (nuevo pago).
2. **Resumen**: «113,98 € al mes compartidos» y «Próximo cobro: Netflix, lunes 16». Los anuales no se prorratean: van aparte, «y 120 € al año» (decisión 6).
3. **Compartidos / Personales** (decisión 2):
   - *Personales*: los que son solo de una persona («Solo tú», «Solo Meri»). Si es tuyo y privado: «No visible para Meri».
   - *Compartidos*: el resto (a medias, proporcional, personalizado, del bote).
4. **Filas**: inicial o icono de categoría, nombre, «Día 16 · Bote común», «Día 25 · A medias · importe variable», importe (con «~» si es aproximado) y una etiqueta «En pausa» si lo está. Al tocar se abre para editar.
5. Pie: «Te avisamos antes de cada cobro. Puedes cambiarlo en cada pago.» Hasta que haya notificaciones: «Los avisos llegarán cuando ito tenga notificaciones.»

### Nuevo / editar pago (mockup `NuevoPago`)

Página completa (modal a pantalla entera, como «Añadir gasto»), porque es un formulario largo:

- **Nombre**, **importe** con **Importe fijo / Importe variable** («Aproximado. Lo ajustas cuando llegue la factura»).
- **Categoría** (chips, como en los gastos; no está en el mockup, pero el gasto la necesita).
- **Frecuencia**: Una vez / Cada mes / Cada año.
  - Cada mes: **día de cobro** con −/+ («El día 16 de cada mes»; 29–31 → último día del mes).
  - Cada año: día y **mes**.
  - Una vez: la **fecha** con el selector de fecha de los gastos.
- **¿Quién paga?**: Bote común / Tú / {Pareja} (sin bote, no sale).
- **¿De quién es?** (si no paga el bote): A medias, Proporcional, Personalizado (con la barra de %), Solo tú, Solo {Pareja}. Mismo código que el formulario de gasto.
- **Resultado**: «Sale del bote común cada mes. Sin deudas» / «Meri te deberá 6,50 € cada mes» / «Pago solo tuyo. No genera deuda».
- **Visible para {Pareja}** (solo si es solo tuyo y lo pagas tú), con el valor por defecto de Ajustes.
- **Aviso**: Sin aviso / El mismo día / 1 día antes / 3 días antes (decisión 4).
- **Mostrar en el calendario** (interruptor).
- **Primer cobro**: «El primero será el 16 dic» (el job no crea cobros anteriores a hoy).
- **Guardar pago**.

Al editar, abajo y en **hojas inferiores**:
- **Pausar / Reanudar**: «No se crearán gastos mientras esté en pausa».
- **Pedir borrar** (o **Borrar** si es privado), con la misma hoja de confirmación que los gastos. «Los gastos que ya se crearon se quedan.»
- **Últimos cobros**: los 6 últimos con su estado (Pagado 48,20 € · Saltado · Pendiente), que abren su gasto.

### Inicio: cobro variable

- Tarjeta «Ha llegado **Luz** (~48,00 €). Pon el importe de la factura» → **Poner importe** / **Este mes no**.
- **Poner importe** abre una hoja con el importe (rellenado con el aproximado) → crea el gasto con el reparto del recurrente y lo enlaza al cobro.
- **Este mes no** → el cobro queda como saltado.

### Gastos

- Los gastos que vienen de un recurrente llevan un icono pequeño de repetición y, en su detalle, «De un pago recurrente: Netflix», que abre el recurrente.

### Ajustes

- En **Privacidad**, segundo interruptor: «Mis pagos recurrentes personales, visibles para {Pareja}» (`share_personal_recurring`, como en el mockup `Ajustes`).

---

## 3. Agujeros en la base de datos (migración `20261119000000_recurrentes.sql`)

1. **Al reanudar un pago en pausa se cobran los días de la pausa.** El job mira hasta 31 días atrás, así que al reanudar crearía de golpe los gastos de cobros de las últimas semanas. Propuesta: columna `active_from date`, que se fija a «hoy» (en la zona de la pareja) al crearlo y al reanudarlo; el job no crea cobros anteriores.
2. **Cualquiera puede escribir en `recurring_occurrences` desde la API**: crear cobros o marcar uno como pagado con cualquier importe sin gasto. Propuesta: sin alta desde el cliente, y al editar solo se permite **pendiente → saltado** (y deshacerlo); «pagado» solo lo pone el trigger del gasto.
3. **Cambiar el día o la frecuencia** con cobros ya creados no da problemas (`unique (recurring_id, due_date)`). No hace falta tocar nada.
4. Si el recurrente lo paga el bote y el bote está desactivado, el job no puede crear el gasto (TW012) y lo reintenta cada día durante 31 días. La app avisa en el recurrente: «El bote está desactivado: este pago no se está apuntando».

---

## 4. Código

| Archivo | Qué |
|---|---|
| `lib/gastos/recurrentes.ts` | Funciones puras con pruebas: próximo cobro (mismo cálculo que `payment_due_dates`: día 29–31, anual, una vez, `end_date`, pausa), total al mes y al año, compartido o personal, textos («Día 16 · Bote común», «Meri te deberá…») |
| `lib/gastos/consultas.ts` | `leerRecurrentes`, `leerRecurrente` (con sus últimos cobros), `crearRecurrente` (id de la app), `editarRecurrente` (control de versión y solo lo que cambia, como los gastos), `pausar`, `ponerImporte(cobro, cents)`, `saltarCobro`, pendientes `variable_amount` |
| `lib/gastos/useGastos.ts` | Hooks; el tiempo real escucha también `recurring_payments` y `recurring_occurrences` |
| `app/gastos/recurrentes.tsx` | Lista |
| `app/gastos/recurrente/nuevo.tsx`, `app/gastos/recurrente/[id].tsx` | Formulario (nuevo y editar) con las hojas de pausar y borrar |
| `components/gastos/FormularioRecurrente.tsx` | El formulario, reutilizando los controles de reparto de `FormularioGasto` |
| `components/gastos/TarjetaRecurrentes.tsx`, `TarjetasPendientes.tsx`, `FilaGasto.tsx` | Tarjeta en Gastos, tarjeta del cobro variable y su hoja, icono de recurrente |

---

## 5. Orden y comprobación

| Paso | Qué | Cómo se comprueba |
|---|---|---|
| 1 | `recurrentes.ts` con pruebas | Día 31 en febrero → 28/29; anual 29 feb en año no bisiesto; una vez ya pasada → sin próximo; en pausa → sin próximo |
| 2 | Migración | Pausar y reanudar → el job no crea cobros de la pausa; marcar «pagado» desde la API → rechazado |
| 3 | Lista y formulario | Crear «Netflix 12,99 € · día de hoy · bote» → ejecutar el job a mano → aparece el gasto en los dos |
| 4 | Variable | Crear «Luz ~48 € · variable · día de hoy» → job → tarjeta en Inicio → poner 52,30 € → gasto y saldo |
| 5 | Editar, pausar y borrar | Meri aprueba el borrado → desaparece; los gastos creados se quedan |
| 6 | Privacidad | Un recurrente «solo tuyo» privado no lo ve Meri |
| 7 | Revisión del arquitecto | Job, permisos, fechas |

Para probar sin esperar al día: en el SQL Editor, `select private.run_daily_jobs();`.

---

## 6. Decisiones que solo puede tomar David

1. **Entrada** desde una tarjeta «Pagos recurrentes» en Gastos, debajo del bote. (Recomendado: sí.)
2. **Personales** = los que son solo de una persona (tuyos o de tu pareja); **compartidos** = el resto. (Recomendado: sí.)
3. **Formulario en página completa** y pausar, borrar y poner importe en **hojas inferiores**. (Recomendado: sí, como «Añadir gasto».)
4. **Aviso** y **Mostrar en el calendario**: guardarlos ya, con la nota «Los avisos llegarán cuando ito tenga notificaciones». (Recomendado: sí, así no hay que volver a editar cada pago.)
5. **Migración** para la pausa y los permisos de los cobros (§3). (Recomendado: sí.)
6. **Resumen**: el total mensual cuenta solo los mensuales; los anuales, aparte («y 120 € al año»). (Recomendado: sí; prorratear confunde.)
7. **Revisión del arquitecto** al terminar. (Recomendado: sí.)

**Decidido tras la revisión (17 nov):**
- Un recurrente proporcional **conserva el % del día en que se creó**: cambiar el proporcional en Ajustes no lo cambia (David). Para usar el nuevo %, se edita el pago.
- Como mucho **un cobro por periodo** (mes, año o uno en total si es puntual): cambiar el día después de un cobro no vuelve a cobrar ese mes.
- La tarjeta de Gastos suma solo los **compartidos**, como la lista.
