# ito · Plan de Gastos, fase 2: saldar y pedir borrar

> Estado: **borrador para revisar con David** (17 nov 2026).
> Alcance: **Saldar cuentas** (todo o por partes), **confirmar o rechazar** un pago en Inicio, **deshacer** un pago, **historial de pagos**, **pedir borrar** un gasto con la aprobación de la otra persona (o borrarlo al momento si es privado) y las **tarjetas de Inicio** para responder.
> **Fuera**: bote común con aportaciones y reembolsos (fase 3), recurrentes (fase 4), «¿Quién pagó?» de eventos (con Calendario), propuestas de cambio de ajustes (con Ajustes), avisos push.
> Mockups: `Saldar`, `Main` (tarjetas «María dice que te ha pagado…» y «María quiere borrar…») y `DetalleGasto` (pedir borrar) en [ito – Mockups](https://claude.ai/artifact/Ld49n1bZM5JJwyw6o4BbJU).

---

## 1. Lo que ya hace la base de datos

No hace falta ninguna migración. Todo está en el esquema inicial:

| RPC | Qué hace |
|---|---|
| `create_settlement(p_id, p_expense_ids[], p_method, p_note)` | Liquida exactamente esos gastos. **La dirección y el importe los calcula el servidor**. Si lo registra **quien recibe**, queda confirmado; si lo registra **quien paga**, queda pendiente. Si los gastos se compensan (neto 0), queda confirmado. Idempotente por `p_id` |
| `respond_settlement(p_id, p_accept)` | Solo quien recibe. Rechazar libera los gastos: vuelven a estar pendientes |
| `undo_settlement(p_id)` | Solo quien lo registró: mientras esté pendiente o hasta **10 minutos** después de confirmarlo |
| `request_deletion(p_id, 'expense', p_target_id)` | Lo privado se borra al momento. Lo compartido queda pendiente; si la otra persona ya lo había pedido, se borra. Caduca a los 7 días |
| `respond_deletion(p_id, p_accept)` / `cancel_deletion(p_id)` | Aprobar o rechazar (la otra persona) / retirar la propia solicitud |
| Vista `pending_actions` | Lo que espera a quien mira: `confirm_settlement` y `approve_deletion` (más otros tipos de fases futuras) |

**Reglas que el servidor ya impone** y la app solo tiene que reflejar:
- `create_settlement` solo acepta gastos **visibles**, **sin saldar**, que **generan deuda entre los dos** (no los del bote ni los «solo tuyo» pagados por ti) y **sin una solicitud de borrado pendiente** (`TW020`).
- Un gasto saldado o pendiente de confirmar no cambia de importe ni de reparto (`TW010`), y no se puede borrar.
- Dos personas no pueden saldar el mismo gasto a la vez (bloqueo `FOR UPDATE`).

---

## 2. Saldar cuentas (mockup `Saldar`)

**Entrada**: botón **Saldar** en la tarjeta de saldo de Gastos (solo si hay algo pendiente).

1. **Resumen**: avatares «de → a» y «**Meri** te debe 35,90 €» / «Debes 12,00 € a **Meri**», calculado sobre **lo seleccionado**.
2. **Qué vas a saldar**: lista con casillas y «Seleccionar todo» (por defecto, todo). Cada fila: concepto, «Pagaste tú · a medias» y su efecto con signo visto desde ti (**+31,00 €** te deben, **−9,00 €** debes). Abajo, «Total seleccionado».
   - La lista sale de los gastos que el servidor aceptaría: visibles, `settlement_id` nulo, efecto ≠ 0 y sin borrado pendiente.
   - El signo y el total se calculan con `efecto()` de `lib/gastos/reparto.ts` (ya probado) sobre las partes **guardadas en el servidor**.
3. **¿Cómo se paga?**: Bizum · Transferencia · Efectivo · Otro (el enum también tiene `other`).
4. **Botón**, según el total seleccionado:
   - te deben → «**He recibido 35,90 €**» (queda confirmado);
   - debes → «**He pagado 12,00 €**» (queda pendiente hasta que Meri lo confirme);
   - se compensan → «**Marcar como saldado**»;
   - nada → desactivado, «Elige qué quieres saldar».
   - Pie: «Si paga quien debe, la otra persona lo confirma en su app».
5. **Pantalla final**:
   - «**¡Cuentas a cero!**» o «Saldado en parte · queda 4,90 €»;
   - si queda pendiente: «**Falta que Meri lo confirme**. Has marcado que pagaste 12,00 € por Bizum.»;
   - **Deshacer** (mientras se pueda: pendiente, o 10 minutos desde que se confirmó), «Ver historial de pagos» y «Volver a Gastos».
6. **Errores**: `TW020` → «Algo ha cambiado mientras tanto (un gasto se ha saldado, editado o pedido borrar). Revisa la lista.» y se recarga. El `p_id` se genera al abrir la pantalla, así que un reintento no crea dos pagos.

---

## 3. Confirmar un pago (mockup `Main`)

- **Inicio** muestra una sección **Pendiente** con las tarjetas de `pending_actions`.
- **Pago por confirmar**: «**Meri** dice que te ha pagado **12,00 €** por Bizum» → **Confirmar** / **No lo he recibido**.
  - Confirmar → «Confirmado» y el saldo baja.
  - No lo he recibido → los gastos vuelven a estar pendientes; «Avisaremos a Meri».
- Mientras está pendiente, la tarjeta de saldo de los dos muestra «12,00 € pendientes de confirmar» (ya existe).
- **Quien pagó** ve el rechazo en el historial de pagos («Meri dice que no lo ha recibido»), y en Gastos un aviso durante 7 días (§8, decisión 2).

---

## 4. Historial de pagos

- En **Historial**, un chip **Pagos** (como en el mockup) que lista las liquidaciones por mes: «**Meri** te pagó 40,00 € · Bizum · 30 oct» / «Pagaste 12,00 € a **Meri**», con su estado: *Pendiente*, *Confirmado* o *Rechazado*.
- Al tocar uno se abre su **detalle de pago** (no está en los mockups; mismo estilo que el detalle de gasto):
  - importe, de quién a quién, método, fecha, estado;
  - los gastos que cubre, que abren su detalle;
  - **Deshacer** si quien mira lo registró y aún se puede;
  - si quien mira tiene que confirmarlo: **Confirmar** / **No lo he recibido**.
- En el detalle de un gasto saldado: «**Saldado** · por Bizum el 30 oct» (o «Pendiente de confirmar»), que abre el pago.
- En las listas, los gastos saldados llevan una etiqueta pequeña «Saldado».

---

## 5. Pedir borrar un gasto (mockups `DetalleGasto` y `Main`)

En el detalle de un gasto, al final:

| Caso | Qué se ve |
|---|---|
| Gasto **privado** (solo tuyo) | «Borrar gasto» → «¿Borrar este gasto? No se puede deshacer.» → se borra al momento |
| Gasto **compartido** | «Pedir borrar este gasto» · «Meri tendrá que aprobarlo» → hoja «¿Pedir borrar este gasto? Meri tendrá que aprobarlo. Si no responde en 7 días, el gasto se queda.» → Enviar solicitud |
| Ya **pediste** borrarlo | Banda «Pendiente de borrar · esperando a **Meri**» con **Retirar solicitud**, y «No se puede saldar mientras tanto» |
| **Meri** pidió borrarlo | Banda «**Meri** quiere borrarlo» con **Aprobar** / **Rechazar** (lo mismo que en Inicio) |
| **Saldado** o pendiente de confirmar | Sin botón; «Saldado: no se puede borrar» |
| Tu pareja aún no se ha unido | Se borra al momento (el servidor ya lo hace así) |

- **Inicio**: «**Meri** quiere borrar «Gasolina · 45,00 €»» · «Caduca en 7 días. Si no respondes, el gasto se queda.» → **Aprobar** / **Rechazar**.
- **El saldo durante la espera**: el mockup dice «Fuera del saldo mientras esté pendiente de borrar», pero el servidor **lo sigue contando** hasta que se borra (`get_balance` no mira las solicitudes). Propuesta: mantener lo del servidor y cambiar el texto a «Sigue en vuestro saldo hasta que **Meri** lo apruebe» (§8, decisión 1).
- Errores: `TW010` (saldado), `TW060` (ya no existe), `TW062` (ya resuelta o caducada) y `TW063` (no te toca aprobarla), con su mensaje y recarga.

---

## 6. Código

| Archivo | Qué |
|---|---|
| `lib/gastos/saldar.ts` | Funciones puras: qué gastos se pueden saldar, total con signo desde quien mira, texto del botón y de la pantalla final, si se puede deshacer. **Con pruebas** |
| `lib/gastos/consultas.ts` | `leerSaldables`, `saldar`, `responderPago`, `deshacerPago`, `leerPagos`, `leerPago`, `leerPendientes`, `pedirBorrar`, `responderBorrado`, `retirarBorrado` |
| `lib/gastos/useGastos.ts` | Hooks nuevos. El canal de tiempo real también escucha `settlements` y `deletion_requests` |
| `app/gastos/saldar.tsx` | Saldar y pantalla final |
| `app/gastos/pago/[id].tsx` | Detalle de pago |
| `components/inicio/TarjetasPendientes.tsx` | Tarjetas de Inicio |
| `app/gastos/[id].tsx`, `historial.tsx`, `TarjetaSaldo.tsx` | Estado saldado, pedir borrar, chip Pagos, botón Saldar |

---

## 7. Orden y comprobación

| Paso | Qué | Cómo se comprueba (dos ventanas) |
|---|---|---|
| 1 | `saldar.ts` con pruebas | Signos desde m1 y m2; neto 0; gastos del bote y «solo tuyo» excluidos |
| 2 | Consultas, hooks y tiempo real | — |
| 3 | Saldar | David (le deben 31 €) → «He recibido 31,00 €» → «¡Cuentas a cero!» en los dos sin recargar |
| 4 | Confirmar en Inicio | Meri (debe) → «He pagado» → David ve la tarjeta → Confirmar → saldo a cero. Repetir con «No lo he recibido» → los gastos vuelven |
| 5 | Deshacer e historial de pagos | Deshacer antes de 10 min → vuelve el saldo; después, el botón ya no sale |
| 6 | Saldar en parte | Elegir 2 de 3 gastos → «Saldado en parte · queda X» |
| 7 | Pedir borrar | Compartido → Meri aprueba en Inicio → desaparece en los dos. Otro → Meri rechaza → se queda. Privado → se borra al momento |
| 8 | Casos cruzados | Pedir borrar un gasto y luego intentar saldarlo → no aparece en la lista; editar un gasto saldado → importe bloqueado |
| 9 | Revisión del arquitecto | Signos, dirección del pago, permisos y estados |

---

## 8. Decisiones que solo puede tomar David

1. **Un gasto pendiente de borrar ¿cuenta en el saldo?** El servidor lo cuenta hasta que se borra; el mockup decía que no. (Recomendado: **que cuente**, como hace el servidor, y cambiar el texto. Así el saldo nunca cambia sin que los dos estén de acuerdo.)
2. **Aviso del pago rechazado** a quien pagó: una línea en Gastos durante 7 días («Meri dice que no ha recibido tu pago de 12,00 €»). (Recomendado: sí.)
3. **Método «Otro»** además de Bizum, Transferencia y Efectivo. (Recomendado: sí; el enum ya lo tiene.)
4. **Revisión del arquitecto** al terminar. (Recomendado: sí.)
